/* eslint-disable react/prop-types */
// as prop-types seem painful to implement without going full typescript
import React, { useReducer, useRef } from "react";
import _ from "lodash";
import moment from "moment";
import "./App.css";
import * as d3 from "d3";
import Controller from "./Controller";
import Inspector from "./Inspector";
import Viz from "./Viz";
import { globalDispatchReducer, initialiseGlobalState } from "./State";
import {
  nodeGitData,
  nodeLinesOfCode,
  nodeLocData,
  nodeChurnData
} from "./nodeData";

/* eslint-disable no-param-reassign */
function addLanguagesFromNode(counts, node) {
  const loc = nodeLocData(node);
  if (loc) {
    const { language, code } = loc;
    if (!counts[language]) {
      counts[language] = { count: 0, loc: 0 };
    }
    counts[language].count += 1;
    counts[language].loc += code;
  }
  if (node.children !== undefined) {
    for (const child of node.children) {
      addLanguagesFromNode(counts, child);
    }
  }
}

/* eslint-enable no-param-reassign */
function countLanguagesIn(data) {
  const counts = {};
  addLanguagesFromNode(counts, data);
  const countsPairs = [...Object.keys(counts)].map(k => [k, counts[k]]);
  const sortedMap = [...countsPairs].sort(
    ([l1, k1], [l2, k2]) => k2.loc - k1.loc
  );
  const colours = d3.schemeTableau10;
  const otherColour = "#303030";
  const languageMap = {};
  const languageKey = [];
  sortedMap.forEach(([key, val], index) => {
    const colour = index < colours.length ? colours[index] : otherColour;
    languageMap[key] = { ...val, colour };
    if (index < colours.length) {
      languageKey.push({ ...val, language: key, colour });
    }
  });
  return { languageKey, languageMap, otherColour };
}

function gatherUndatedNodeStats(node, statsSoFar, depth) {
  let stats = _.cloneDeep(statsSoFar);
  if (stats.maxDepth < depth) {
    stats.maxDepth = depth;
  }
  const loc = nodeLinesOfCode(node);
  if (loc && loc > stats.maxLoc) {
    stats.maxLoc = loc;
  }
  const gitData = nodeGitData(node);
  if (gitData && gitData.details && gitData.details.length > 0) {
    const days = gitData.details.map(d => d.commit_day);
    if (gitData.lastUpdate) {
      days.push(gitData.lastUpdate);
    }
    if (gitData.creationDate) {
      days.push(gitData.creationDate);
    }
    days.sort();
    const earliest = days[0];
    const latest = days[days.length - 1];
    if (stats.earliestCommit === undefined || earliest < stats.earliestCommit) {
      stats.earliestCommit = earliest;
    }
    if (stats.latestCommit === undefined || latest > stats.latestCommit) {
      stats.latestCommit = latest;
    }
  }
  if (node.children !== undefined) {
    stats = node.children.reduce((memo, child) => {
      return gatherUndatedNodeStats(child, memo, depth + 1);
    }, stats);
  }
  return stats;
}

function gatherDatedNodeStats(node, statsSoFar) {
  let stats = _.cloneDeep(statsSoFar);
  const { earliestSelected, latestSelected } = stats;
  const churnData = nodeChurnData(node, earliestSelected, latestSelected);
  if (churnData) {
    const { totalLines, totalCommits, totalDays } = churnData;
    if (stats.churn.maxLines < totalLines) stats.churn.maxLines = totalLines;
    if (stats.churn.maxCommits < totalCommits)
      stats.churn.maxCommits = totalCommits;
    if (stats.churn.maxDays < totalDays) stats.churn.maxDays = totalDays;
  }
  if (node.children !== undefined) {
    stats = node.children.reduce((memo, child) => {
      return gatherDatedNodeStats(child, memo);
    }, stats);
  }
  return stats;
}

function gatherGlobalStats(data) {
  const statsSoFar = {
    earliestCommit: undefined,
    latestCommit: undefined,
    earliestSelected: undefined,
    latestSelected: undefined,
    maxDepth: 0,
    maxLoc: 0,
    churn: {
      maxLines: 0,
      maxCommits: 0,
      maxDays: 0
    }
  };
  const globalStats = gatherUndatedNodeStats(data, statsSoFar, 0);
  const { earliestCommit, latestCommit } = globalStats;

  const twoYearsAgo = moment
    .unix(latestCommit)
    .subtract(2, "year")
    .unix();

  globalStats.earliestSelected =
    twoYearsAgo < earliestCommit ? earliestCommit : twoYearsAgo;
  globalStats.latestSelected = latestCommit;
  return gatherDatedNodeStats(data, globalStats);
}

const App = props => {
  // eslint-disable-next-line react/prop-types
  const { rawData } = props;
  console.log("postprocessing languages");
  const languages = countLanguagesIn(rawData);
  console.log("postprocessing global stats");
  const stats = gatherGlobalStats(rawData);
  console.log("postprocessing complete");
  const { users } = rawData.data.git_meta;
  const metadata = {
    languages,
    stats,
    users
  };
  const [vizState, dispatch] = useReducer(
    globalDispatchReducer,
    { rawData, metadata },
    initialiseGlobalState
  );
  const data = useRef({ metadata, files: rawData });

  return (
    <div className="App">
      <header className="App-header">
        <h1>Polyglot Code Explorer</h1>
      </header>
      <Viz data={data} state={vizState} dispatch={dispatch} />
      <Controller data={data} state={vizState} dispatch={dispatch} />
      <Inspector metadata={metadata} state={vizState} dispatch={dispatch} />
    </div>
  );
};

export default App;
