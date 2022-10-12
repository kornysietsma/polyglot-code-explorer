import React, { MutableRefObject, useEffect, useRef, useState } from "react";
import semver from "semver";

import App from "./App";
import { ExportableState } from "./exportImport";
import { PolyglotData, SUPPORTED_FILE_VERSION } from "./polyglot_data.types";
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

        const data = json as PolyglotData;
        if (data.version === undefined) {
          throw new Error(
            `No version in JSON data file at ${url} - this supports data versions ${SUPPORTED_FILE_VERSION}`
          );
        }
        if (!semver.satisfies(data.version, SUPPORTED_FILE_VERSION)) {
          throw new Error(
            `Invalid version ${data.version} in JSON data file at ${url} - this supports data versions ${SUPPORTED_FILE_VERSION}`
          );
        }
        if (!data.features.file_stats && !data.features.git) {
          throw new Error(
            "Data file must have file stats or git details enabled"
          );
        }
        console.log("linking parents");
        linkParents(data);
        console.log("postprocessing languages");
        const languages = countLanguagesIn(data);
        console.log("postprocessing global stats");
        const stats = gatherGlobalStats(data);
        console.log("building node index");
        const nodesByPath = gatherNodesByPath(data);
        console.log("building date scale data");
        const timescaleData = gatherTimescaleData(data, "week");
        console.log("postprocessing complete");
        const users = postprocessUsers(data.metadata.git?.users);
        if (data.metadata.coupling) {
          const bucketConfig = data.metadata.coupling.buckets;
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
        setData({ data: data, metadata });
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

const useFetchStateFile = (url: string) => {
  const [data, setData] = useState<ExportableState>();

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch(url);
        const ok = await response.ok;
        if (!ok) {
          if (response.status >= 400 && response.status < 500) {
            console.log(
              `No initial state file: response ${response.status}:${response.statusText}`
            );
          } else {
            console.error(
              `Ignoring invalid response fetching state file: ${response.status}:${response.statusText}`
            );
          }
          return;
        }
        const json = await response.json();
        setData(json as ExportableState);
      } catch (e) {
        console.error("Ignoring error loading initial state:", e);
      }
    }
    fetchData();
  }, [url]);

  return data;
};

// While we are loading the data, it's value might be undefined
export type ExportableStateMaybe = MutableRefObject<
  ExportableState | undefined
>;

const Loader = () => {
  const dataFile = process.env.REACT_APP_EXPLORER_DATA || "default";
  const url = `${process.env.PUBLIC_URL}/data/${dataFile}.json`;
  const stateUrl = `${process.env.PUBLIC_URL}/data/${dataFile}_state.json`;

  const dataRefEventually: VizDataRefMaybe = useRef<VizData>();
  const [errors, setErrors] = useState<string[]>([]);
  const stateRefEventually: ExportableStateMaybe = useRef<ExportableState>();

  const data = useFetch(url, setErrors);
  dataRefEventually.current = data;

  const initialState = useFetchStateFile(stateUrl);
  stateRefEventually.current = initialState;

  console.log("in loader, errors:", errors);

  console.log("state ref now", stateRefEventually);

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
    <App
      dataRefMaybe={dataRefEventually}
      initialStateMaybe={stateRefEventually}
    />
  );
};

export default Loader;
