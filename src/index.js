import React from "react";
import ReactDOM from "react-dom";
import "./css/normalize.css";
import "./css/custom.css";
import App from "./App";
import * as serviceWorker from "./serviceWorker";
import {
  countLanguagesIn,
  gatherTimescaleData,
  gatherGlobalStats,
  gatherNodesByPath
} from "./preprocess";

const xhttp = new XMLHttpRequest();
let data = {};
xhttp.onreadystatechange = function() {
  console.log("loaded raw data");
  if (this.readyState === 4 && this.status === 200) {
    console.log("loading app");
    // load up the raw data when it is available
    data = JSON.parse(xhttp.responseText);
    console.log("postprocessing languages");
    const languages = countLanguagesIn(data);
    console.log("postprocessing global stats");
    const stats = gatherGlobalStats(data);
    console.log("building node index");
    const nodesByPath = gatherNodesByPath(data);
    console.log("building date scale data");
    const timescaleData = gatherTimescaleData(data, "week");
    console.log("postprocessing complete");
    const { users } = data.data.git_meta;
    if (data.data.coupling_meta) {
      stats.coupling = {
        bucketCount: data.data.coupling_meta.bucket_count,
        bucketSize: data.data.coupling_meta.bucket_size,
        firstBucketStart: data.data.coupling_meta.first_bucket_start
      };
    }
    const metadata = {
      languages,
      stats,
      users,
      nodesByPath,
      timescaleData
    };
    ReactDOM.render(
      <App rawData={data} metadata={metadata} />,
      document.getElementById("root")
    );
  }
};

const dataFile = process.env.REACT_APP_LATI_DATA || "default";

xhttp.open("GET", `${process.env.PUBLIC_URL}/data/${dataFile}.json`, true);
xhttp.send();

// ReactDOM.render(<App />, document.getElementById("root"));

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
