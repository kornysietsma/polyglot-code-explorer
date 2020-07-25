import React, { useState, useEffect, useRef } from "react";
import App from "./App";
import {
  countLanguagesIn,
  gatherTimescaleData,
  gatherGlobalStats,
  gatherNodesByPath
} from "./preprocess";

const useFetch = url => {
  const [data, setData] = useState(null);

  useEffect(() => {
    async function fetchData() {
      const response = await fetch(url);
      const json = await response.json();
      console.log("postprocessing languages");
      const languages = countLanguagesIn(json);
      console.log("postprocessing global stats");
      const stats = gatherGlobalStats(json);
      console.log("building node index");
      const nodesByPath = gatherNodesByPath(json);
      console.log("building date scale data");
      const timescaleData = gatherTimescaleData(json, "week");
      console.log("postprocessing complete");
      const { users } = json.data.git_meta;
      if (json.data.coupling_meta) {
        stats.coupling = {
          bucketCount: json.data.coupling_meta.bucket_count,
          bucketSize: json.data.coupling_meta.bucket_size,
          firstBucketStart: json.data.coupling_meta.first_bucket_start
        };
      }
      const metadata = {
        languages,
        stats,
        users,
        nodesByPath,
        timescaleData
      };
      setData({ files: json, metadata });
    }
    fetchData();
  }, [url]);

  return data;
};

const Loader = () => {
  const dataFile = process.env.REACT_APP_EXPLORER_DATA || "default";
  const url = `${process.env.PUBLIC_URL}/data/${dataFile}.json`;

  const dataRef = useRef(null);

  const data = useFetch(url);
  dataRef.current = data;

  return data == null ? <div>Loading...</div> : <App dataRef={dataRef} />;
};

export default Loader;
