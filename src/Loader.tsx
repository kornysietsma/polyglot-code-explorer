import React, { useEffect, useRef, useState } from "react";
import semver from "semver";

import App from "./App";
import { SUPPORTED_FILE_VERSION, Tree } from "./polyglot_data.types";
import {
  countLanguagesIn,
  gatherGlobalStats,
  gatherNodesByPath,
  gatherTimescaleData,
  linkParents,
  postprocessUsers,
} from "./preprocess";
import { VizData, VizDataRefMaybe } from "./viz.types";

const useFetch = (
  url: string,
  setErrors: React.Dispatch<React.SetStateAction<string[]>>
) => {
  const [data, setData] = useState<VizData>();

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch(url);
        const json = await response.json();

        const tree = json as Tree;
        if (tree.version === undefined) {
          throw new Error(
            `No version in JSON data file at ${url} - this supports data versions ${SUPPORTED_FILE_VERSION}`
          );
        }
        if (!semver.satisfies(tree.version, SUPPORTED_FILE_VERSION)) {
          throw new Error(
            `Invalid version ${tree.version} in JSON data file at ${url} - this supports data versions ${SUPPORTED_FILE_VERSION}`
          );
        }
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
        const users = postprocessUsers(tree.metadata.git?.users);
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
      } catch (e) {
        if (e instanceof Error) {
          const errors = [`Error ${e.name}:`, e.message];
          setErrors(errors);
        } else {
          setErrors([`${e}`]);
        }
      }
    }
    fetchData();
  }, [url, setErrors]);

  return data;
};

const Loader = () => {
  const dataFile = process.env.REACT_APP_EXPLORER_DATA || "default";
  const url = `${process.env.PUBLIC_URL}/data/${dataFile}.json`;

  const dataRefEventually: VizDataRefMaybe = useRef<VizData>();
  const [errors, setErrors] = useState<string[]>([]);

  const data = useFetch(url, setErrors);
  dataRefEventually.current = data;

  console.log("in loader, errors:", errors);

  return errors.length > 0 ? (
    <div>
      <h1>Errors loading data:</h1>
      <ul>
        {errors.map((e, ix) => (
          <li key={ix}>{e}</li>
        ))}
      </ul>
    </div>
  ) : dataRefEventually.current === undefined ? (
    <div>Loading...</div>
  ) : (
    <App dataRefMaybe={dataRefEventually} />
  );
};

export default Loader;
