// The one place a `State` is turned into a new `State`. Every case returns a fresh object rather
// than mutating, and the `default` branch's `never` check is what makes an unhandled `Action` a
// compile error.

import _ from "lodash";

import { State } from "../state";
import { isParentVisualization, Visualizations } from "../VisualizationData";
import { Action } from "./actions";
import { themedColours } from "./colours";

export function updateStateFromAction(state: State, action: Action): State {
  const { expensiveConfig, couplingConfig, config } = state;
  switch (action.type) {
    case "setVisualization": {
      const visualization = action.payload;
      const visData = Visualizations[visualization];
      if (visData == undefined) {
        throw new Error("Logic error, invalid visualization");
      }
      if (isParentVisualization(visData)) {
        const subVis = visData.defaultChild;
        return {
          ...state,
          config: {
            ...config,
            visualization,
            subVis,
          },
        };
      }
      return { ...state, config: { ...config, visualization } };
    }
    case "setSubVisualization":
      return { ...state, config: { ...config, subVis: action.payload } };
    case "setDepth":
      return {
        ...state,
        expensiveConfig: { ...expensiveConfig, depth: action.payload },
      };
    case "setShowCoupling": {
      return {
        ...state,
        couplingConfig: { ...couplingConfig, shown: action.payload },
      };
    }
    case "setMinCouplingRatio": {
      return {
        ...state,
        couplingConfig: { ...couplingConfig, minRatio: action.payload },
      };
    }
    case "setCouplingMinBursts": {
      return {
        ...state,
        couplingConfig: { ...couplingConfig, minBursts: action.payload },
      };
    }
    case "setCouplingMaxCommonRoots": {
      return {
        ...state,
        couplingConfig: { ...couplingConfig, maxCommonRoots: action.payload },
      };
    }
    case "selectNode":
      return {
        ...state,
        config: { ...config, selectedNode: action.payload },
      };

    case "setDateRange": {
      const [early, late] = action.payload;
      const result = _.cloneDeep(state);
      result.config.filters.dateRange.earliest = early;
      result.config.filters.dateRange.latest = late;
      result.couplingConfig.dateRange.earliest = early;
      result.couplingConfig.dateRange.latest = late;
      return result;
    }

    case "setTheme": {
      const result = _.cloneDeep(state);
      result.config.colours.currentTheme = action.payload;
      return result;
    }

    case "enableCodeServer": {
      const result = _.cloneDeep(state);
      result.config.codeInspector.enabled = action.payload;
      return result;
    }

    case "setCodeServerPrefix": {
      const result = _.cloneDeep(state);
      result.config.codeInspector.prefix = action.payload;
      return result;
    }

    case "setRemoteUrlTemplate": {
      const result = _.cloneDeep(state);
      result.config.remoteUrlTemplate = action.payload;
      return result;
    }

    case "addMessage": {
      return { ...state, messages: [...state.messages, action.payload] };
    }

    case "addMessages": {
      return { ...state, messages: [...state.messages, ...action.payload] };
    }

    case "clearMessages": {
      return { ...state, messages: [] };
    }

    case "setUserTeamAliasData": {
      const result = _.cloneDeep(state);
      result.config.teamsAndAliases.teams = action.payload.teams;
      result.config.teamsAndAliases.aliases = action.payload.aliases;
      result.config.teamsAndAliases.ignoredUsers = action.payload.ignoredUsers;
      result.config.teamsAndAliases.aliasData = action.payload.aliasData;
      result.config.colours[
        result.config.colours.currentTheme
      ].teams.noTeamColour = action.payload.noTeamColour;

      return result;
    }

    case "setFileChangeMetric":
      return {
        ...state,
        config: { ...config, fileChangeMetric: action.payload },
      };

    case "setShowNonTeamChanges": {
      const result = _.cloneDeep(state);
      result.config.teamVisualisation.showNonTeamChanges = action.payload;
      return result;
    }

    case "selectTeam": {
      const newTeam = action.payload == "" ? undefined : action.payload;
      const result = _.cloneDeep(state);
      result.config.teamVisualisation.selectedTeam = newTeam;
      return result;
    }
    case "setShowLevelAsLightness": {
      const result = _.cloneDeep(state);
      result.config.teamVisualisation.showLevelAsLightness = action.payload;
      return result;
    }
    case "setLightnessCap": {
      const result = _.cloneDeep(state);
      result.config.teamVisualisation.lightnessCap = action.payload;
      return result;
    }
    case "setAllState": {
      return action.payload;
    }

    case "setColour": {
      const result = _.cloneDeep(state);
      _.set(
        themedColours(result.config),
        action.payload.name,
        action.payload.value
      );
      return result;
    }

    case "setLines": {
      const result = _.cloneDeep(state);
      result.config.nesting.nestedWidths = [...action.payload.nestedWidths];
      result.config.nesting.defaultWidth = action.payload.defaultWidth;
      themedColours(result.config).defaultStroke = action.payload.defaultStroke;
      themedColours(result.config).nestedStrokes = [
        ...action.payload.nestedStrokes,
      ];

      return result;
    }

    default: {
      const impossible: never = action; // this will cause an error if an Action type isn't handled above
      return impossible;
    }
  }
}
