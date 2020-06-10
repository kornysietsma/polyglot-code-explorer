import React, { useReducer, useRef } from "react";
import "./App.css";
import * as d3 from "d3";
import Controller from "./Controller";
import Inspector from "./Inspector";
import Viz from "./Viz";
import { globalDispatchReducer, initialiseGlobalState } from "./State";
import { nodeLocData } from "./nodeData";

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
  console.log(counts);
  const countsPairs = [...Object.keys(counts)].map(k => [k, counts[k]]);
  const sortedMap = [...countsPairs].sort(
    ([l1, k1], [l2, k2]) => k2.loc - k1.loc
  );
  console.log("sorted:", sortedMap);
  // const colours = d3.schemeSet3;
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
  console.log(languageMap);
  console.log(languageKey);
  return { languageKey, languageMap, otherColour };
}

const App = props => {
  // eslint-disable-next-line react/prop-types
  console.log("in app");
  const { rawData } = props;
  const languages = countLanguagesIn(rawData);
  const [vizState, dispatch] = useReducer(
    globalDispatchReducer,
    rawData,
    initialiseGlobalState
  );
  const data = useRef({languages, files: rawData});

  console.log("app constructor with state:", vizState);

  return (
    <div className="App">
      <header className="App-header">
        <h1>LATI Code Visualizer</h1>
      </header>
      <Viz data={data} state={vizState} dispatch={dispatch} />
      <Controller data={data} state={vizState} dispatch={dispatch} />
      <Inspector state={vizState} dispatch={dispatch} />
    </div>
  );
};

export default App;
