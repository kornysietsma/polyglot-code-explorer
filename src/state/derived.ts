// The derived half of the state: `calculated`, recomputed from `config` after every dispatch.
// The recompute is diffed rather than unconditional - user->team lookups, file maxima and the
// SVG stripe patterns are each redone only when their own inputs changed - because doing it
// eagerly is too slow on a large tree. `state.test.ts` pins both halves of that: the recompute
// happens when it must, and is skipped when it needn't. Keep it that way.

import _ from "lodash";

import { calculateFileMaxima } from "../model/gitChanges";
import { State, Teams, UserTeams } from "../state";
import { calculateSvgPatterns } from "../svgPatterns";
import { VizDataRef } from "../viz.types";
import { Action } from "./actions";
import { themedColours } from "./colours";
import { updateStateFromAction } from "./reducer";

export function buildUserTeams(teams: Teams): UserTeams {
  const result: UserTeams = new Map();
  for (const [name, team] of teams) {
    if (!team.hidden) {
      for (const user of team.users) {
        const userTeamData = result.get(user);
        if (!userTeamData) {
          result.set(user, new Set([name]));
        } else {
          userTeamData.add(name);
        }
      }
    }
  }
  return result;
}

// allows state changes that need to access data
export function postprocessState(
  dataRef: VizDataRef,
  oldState: State,
  newState: State
) {
  console.time("postprocessing state");
  let resultingState = newState;
  let alreadyCloned = false;
  // Every block below writes into `calculated`, so each has to be working on a copy - but only
  // the first one to fire should pay for the clone. Going through this rather than each block
  // testing `alreadyCloned` itself keeps them independently correct: the file-maxima block used
  // to write straight into `resultingState`, safe only because its condition happened to imply
  // the user-teams block above had already cloned.
  const mutableState = () => {
    if (!alreadyCloned) {
      resultingState = _.cloneDeep(resultingState);
      alreadyCloned = true;
    }
    return resultingState;
  };
  const force = newState.calculated.forceRecalculateAll;
  const datesChanged = !_.isEqual(
    oldState.config.filters.dateRange,
    resultingState.config.filters.dateRange
  );
  if (
    force ||
    datesChanged ||
    !_.isEqual(
      resultingState.config.teamsAndAliases,
      oldState.config.teamsAndAliases
    )
  ) {
    console.time("postprocessing - building user teams");
    const state = mutableState();
    state.calculated.userTeams = buildUserTeams(
      state.config.teamsAndAliases.teams
    );
    console.timeEnd("postprocessing - building user teams");
  }
  if (force || datesChanged) {
    console.time("postprocessing - file maxima");
    const state = mutableState();
    state.calculated.fileMaxima = calculateFileMaxima(
      state,
      dataRef.current.data.tree
    );
    console.timeEnd("postprocessing - file maxima");
  }
  if (force || newState.config.visualization == "teamPattern") {
    console.time("checking for svg state change");
    if (
      force ||
      oldState.config.visualization != newState.config.visualization ||
      !_.isEqual(
        oldState.config.teamVisualisation,
        newState.config.teamVisualisation
      ) ||
      !_.isEqual(
        oldState.config.teamsAndAliases,
        newState.config.teamsAndAliases
      ) ||
      datesChanged ||
      // by value, like every other check here - the team colours are a fresh object on any
      // state that was cloned, so comparing by reference recomputed the whole pattern set
      // on dispatches that had not touched a colour at all
      !_.isEqual(
        themedColours(oldState.config).teams,
        themedColours(newState.config).teams
      )
    ) {
      console.timeEnd("checking for svg state change");
      console.time("postprocessing - svg patterns");
      const state = mutableState();
      state.calculated.svgPatterns = calculateSvgPatterns(
        state,
        dataRef.current.data
      );
      console.timeEnd("postprocessing - svg patterns");
    } else {
      console.timeEnd("checking for svg state change");
    }
  }
  if (force) {
    mutableState().calculated.forceRecalculateAll = false;
  }
  console.timeEnd("postprocessing state");
  return resultingState;
}

// Note - this takes a binding of the data ref, so App.js can pass in the data and the reducer can update state based on data.
export function globalDispatchReducer(dataRef: VizDataRef) {
  return (state: State, action: Action) => {
    const newState = updateStateFromAction(state, action);
    return postprocessState(dataRef, state, newState);
  };
}
