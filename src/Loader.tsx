import React, { useEffect, useRef, useState } from "react";

import App from "./App";
import { Tree } from "./polyglot_data.types";
import {
  countLanguagesIn,
  gatherGlobalStats,
  gatherNodesByPath,
  gatherTimescaleData,
  linkParents,
} from "./preprocess";
import { VizData, VizDataRefMaybe } from "./viz.types";

const useFetch = (url: string) => {
  const [data, setData] = useState<VizData>();

  useEffect(() => {
    async function fetchData() {
      const response = await fetch(url);
      const json = await response.json();
      //TODO: create a typed data structure from json
      // const cleanData: Array<DataEntry>  = ...
      const tree = json as Tree;
      console.log("linking parents");
      linkParents(tree);
      console.log("postprocessing languages");
      const languages = countLanguagesIn(tree);
      console.log("postprocessing global stats");
      const stats = gatherGlobalStats(tree);
      console.log("building node index");
      const nodesByPath = gatherNodesByPath(tree);
      console.log("building date scale data");
      const timescaleData = gatherTimescaleData(tree, "week");
      console.log("postprocessing complete");
      const users = tree.metadata.git?.users;
      if (tree.metadata.coupling) {
        const bucketConfig = tree.metadata.coupling.buckets;
        stats.coupling = {
          bucketCount: bucketConfig.bucket_count,
          bucketSize: bucketConfig.bucket_size,
          firstBucketStart: bucketConfig.first_bucket_start,
        };
      }
      const metadata = {
        languages,
        stats,
        users,
        nodesByPath,
        timescaleData,
      };
      setData({ files: tree, metadata });
    }
    fetchData();
  }, [url]);

  return data;
};

const Loader = () => {
  const dataFile = process.env.REACT_APP_EXPLORER_DATA || "default";
  const url = `${process.env.PUBLIC_URL}/data/${dataFile}.json`;

  const dataRefEventually: VizDataRefMaybe = useRef<VizData>();

  const data = useFetch(url);
  dataRefEventually.current = data;

  return dataRefEventually.current === undefined ? (
    <div>Loading...</div>
  ) : (
    <App dataRefMaybe={dataRefEventually} />
  );
};

export default Loader;
