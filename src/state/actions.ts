// Every way the UI can change the state, as one discriminated union. `reducer.ts`'s switch is
// exhaustive over it via a `never` check, so adding a member here without handling it there is a
// compile error rather than a silent no-op.

import {
  FileChangeMetric,
  Message,
  State,
  Teams,
  UserAliasData,
  UserAliases,
} from "../state";
import { Visualizations } from "../VisualizationData";

type VisualizationKey = Extract<keyof typeof Visualizations, string>;
interface SetVisualization {
  type: "setVisualization";
  payload: VisualizationKey;
}

interface SetSubVisualization {
  type: "setSubVisualization";
  payload: string;
}

interface SetDepth {
  type: "setDepth";
  payload: number;
}

interface SetShowCoupling {
  type: "setShowCoupling";
  payload: boolean;
}

interface SetMinCouplingRatio {
  type: "setMinCouplingRatio";
  payload: number;
}

interface SetCouplingMinBursts {
  type: "setCouplingMinBursts";
  payload: number;
}

interface SetCouplingMaxCommonRoots {
  type: "setCouplingMaxCommonRoots";
  payload: number;
}

interface SelectNode {
  type: "selectNode";
  payload: string;
}

interface SetDateRange {
  type: "setDateRange";
  payload: [number, number];
}
interface SetTheme {
  type: "setTheme";
  payload: "dark" | "light";
}
interface EnableCodeServer {
  type: "enableCodeServer";
  payload: boolean;
}
interface SetCodeServerPrefix {
  type: "setCodeServerPrefix";
  payload: string;
}
interface SetRemoteUrlTemplate {
  type: "setRemoteUrlTemplate";
  payload: string;
}
interface AddMessage {
  type: "addMessage";
  payload: Message;
}
interface AddMessages {
  type: "addMessages";
  payload: Message[];
}

interface ClearMessages {
  type: "clearMessages";
}
interface SetUserTeamAliasData {
  type: "setUserTeamAliasData";
  payload: {
    teams: Teams;
    aliases: UserAliases;
    ignoredUsers: Set<number>;
    aliasData: UserAliasData;
    noTeamColour: string;
  };
}
interface SetFileChangeMetric {
  type: "setFileChangeMetric";
  payload: FileChangeMetric;
}

interface SetShowNonTeamChanges {
  type: "setShowNonTeamChanges";
  payload: boolean;
}

interface SelectTeam {
  type: "selectTeam";
  payload: string;
}

interface SetShowLevelAsLightness {
  type: "setShowLevelAsLightness";
  payload: boolean;
}

interface SetColour {
  type: "setColour";
  payload: { name: string; value: string };
}

interface SetLines {
  type: "setLines";
  payload: {
    nestedWidths: [number, number, number, number];
    defaultWidth: number;
    nestedStrokes: [string, string, string, string];
    defaultStroke: string;
  };
}

interface SetLightnessCap {
  type: "setLightnessCap";
  payload: number;
}

interface SetAllState {
  type: "setAllState";
  payload: State;
}

export type Action =
  | SetVisualization
  | SetSubVisualization
  | SetDepth
  | SetShowCoupling
  | SetMinCouplingRatio
  | SetCouplingMinBursts
  | SetCouplingMaxCommonRoots
  | SelectNode
  | SetDateRange
  | SetTheme
  | EnableCodeServer
  | SetCodeServerPrefix
  | SetRemoteUrlTemplate
  | AddMessage
  | AddMessages
  | ClearMessages
  | SetUserTeamAliasData
  | SetFileChangeMetric
  | SetShowNonTeamChanges
  | SelectTeam
  | SetShowLevelAsLightness
  | SetLightnessCap
  | SetColour
  | SetLines
  | SetAllState;
