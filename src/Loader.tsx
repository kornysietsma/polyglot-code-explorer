import React, { MutableRefObject, useEffect, useRef, useState } from "react";
import semver from "semver";

import App from "./App";
import ErrorBoundary from "./ErrorBoundary";
import ErrorReport from "./ErrorReport";
import { ExportableState } from "./exportImport";
import { PolyglotData, SUPPORTED_FILE_VERSION } from "./polyglot_data.types";
import {
  countLanguagesIn,
  gatherGlobalStats,
  gatherNodesByPath,
  gatherTimescaleData,
  indexUsersById,
  linkParents,
  postprocessUsers,
} from "./preprocess";
import { VizData, VizDataRefMaybe } from "./viz.types";

/**
 * V8 cannot create a string longer than 2^29 - 24 bytes, and `response.json()` decodes the whole
 * body to a string before parsing it — so a data file above this size cannot load however much
 * heap is free. Confirmed in Chrome: `"a".repeat(536870889)` throws `RangeError: Invalid string
 * length`.
 *
 * This is a real ceiling rather than a chosen one, which matters because scanner outputs get
 * genuinely large. `data/spring-projects.json` (514 MB, 80,691 nodes) sits just under it and
 * loads fine, using 508 MB of a 4.4 GB heap — so this refuses only files that truly cannot be
 * parsed, and says so up front instead of failing somewhere deep in the fetch.
 */
export const MAX_DATA_FILE_BYTES = 536_870_888;

const describeBytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

const useFetch = (
  url: string,
  setErrors: React.Dispatch<React.SetStateAction<string[]>>
) => {
  const [data, setData] = useState<VizData>();

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          // Without this an HTTP failure reaches `json()` anyway, and a 500's HTML error page
          // is reported as a JSON syntax error — which says nothing about what went wrong.
          throw new Error(
            `Failed to fetch data file at ${url}: ${response.status} ${response.statusText}`
          );
        }
        // `fetch` resolves once the headers are in, so this refuses an impossible file before
        // the body is read — and cancels the download rather than spending minutes on hundreds
        // of megabytes that cannot be parsed anyway.
        const declaredSize = Number(response.headers.get("Content-Length"));
        if (
          Number.isFinite(declaredSize) &&
          declaredSize > MAX_DATA_FILE_BYTES
        ) {
          await response.body?.cancel();
          throw new Error(
            `Data file at ${url} is ${describeBytes(declaredSize)}, larger than the ` +
              `${describeBytes(MAX_DATA_FILE_BYTES)} this browser can parse. Scan a subset of ` +
              `the codebase, or turn off features that add per-file detail.`
          );
        }
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
        const usersById = indexUsersById(users);
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
          usersById,
          nodesByPath,
          timescaleData,
        };
        setData({ data: data, metadata });
      } catch (e) {
        if (e instanceof Error) {
          const errors = [`${e.name}:`, e.message];
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
  const dataFile = __EXPLORER_DATA__;
  const url = `${import.meta.env.BASE_URL}data/${dataFile}.json`;
  const stateUrl = `${import.meta.env.BASE_URL}data/${dataFile}_state.json`;

  const dataRefEventually: VizDataRefMaybe = useRef<VizData | undefined>(
    undefined
  );
  const [errors, setErrors] = useState<string[]>([]);
  const stateRefEventually: ExportableStateMaybe = useRef<
    ExportableState | undefined
  >(undefined);

  const data = useFetch(url, setErrors);
  dataRefEventually.current = data;

  const initialState = useFetchStateFile(stateUrl);
  stateRefEventually.current = initialState;

  return errors.length > 0 ? (
    <ErrorReport title="Errors loading data:" lines={errors} />
  ) : dataRefEventually.current === undefined ? (
    <div>Loading...</div>
  ) : (
    <ErrorBoundary>
      <App
        dataRefMaybe={dataRefEventually}
        initialStateMaybe={stateRefEventually}
      />
    </ErrorBoundary>
  );
};

export default Loader;
