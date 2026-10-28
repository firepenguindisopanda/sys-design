import type {
  CheckStatus,
  ComponentKind,
  EdgeProtocol,
  NonFunctionalRequirements,
  Resources,
} from "@/lib/types";

/** Named sets of component kinds usable in rules. */
export type NodeGroup = "client" | "compute";

/** A rule endpoint: one component kind, or a group of kinds. */
export type NodeMatcher = ComponentKind | NodeGroup;

export type RuleSeverity = "fail" | "warn";

export type ComponentRule = {
  id: string;
  /** Short name shown to students in verification results */
  title: string;
  type: "component";
  kind: NodeMatcher;
  /** At least this many matching nodes must meet minConfig */
  min: number;
  /** Numeric config fields compared with >= (e.g. { replicas: 2 }) */
  minConfig: Record<string, number>;
  severity: RuleSeverity;
  why: string;
};

export type EdgeRule = {
  id: string;
  /** Short name shown to students in verification results */
  title: string;
  type: "edge";
  mode: "required" | "forbidden";
  /** Any of these may be the source (YAML accepts one value or a list) */
  from: NodeMatcher[];
  /** Any of these may be the target */
  to: NodeMatcher[];
  /** null means any protocol */
  protocols: EdgeProtocol[] | null;
  severity: RuleSeverity;
  why: string;
};

export type Rule = ComponentRule | EdgeRule;

export type BriefFeature = {
  name: string;
  description: string;
  resources: Resources;
  targetRpm: number;
  computeMsPerRequest: number;
  backgroundWorkMs?: number;
  pollingRpm?: number;
  fileRpm?: number;
  writeRpm?: number;
};

export type BriefRequirement = {
  id: string;
  text: string;
  feature: BriefFeature;
};

export type Brief = {
  id: string;
  title: string;
  tagline: string;
  /** Where the scenario came from (attribution) */
  source: string;
  summary: string;
  outOfScope: string[];
  functionalRequirements: BriefRequirement[];
  nfr: NonFunctionalRequirements;
  rules: Rule[];
  /** Questions for the student; not graded */
  reflection: string[];
};

export type CompactNode = {
  id: string;
  kind: ComponentKind;
  label: string | null;
  /** null means the catalog's purpose for this kind */
  purpose: string | null;
  /** Canvas position (`at: [x, y]`); null places the node on a grid */
  position: { x: number; y: number } | null;
  /** Merged over the catalog defaultConfig for this kind */
  config: Record<string, unknown>;
};

export type CompactEdge = {
  /** `<source>-><target>`, stable so engine check ids are predictable */
  id: string;
  source: string;
  target: string;
  protocol: EdgeProtocol;
};

export type CompactDesign = {
  nodes: CompactNode[];
  edges: CompactEdge[];
  /** Functional requirement id → compute node id */
  placements: Record<string, string>;
};

export type FixtureExpectation = {
  /** true: no engine check and no rule may have status "fail" */
  pass: boolean;
  /** Engine check ids or rule ids that must have status "fail" */
  fails: string[];
  /** Engine check ids or rule ids that must have status "warn" */
  warns: string[];
};

export type Fixture = {
  /** File name without extension, e.g. "good" or "bad-no-cache" */
  name: string;
  description: string;
  design: CompactDesign;
  expect: FixtureExpectation;
  /** Why the engine gets this fixture wrong today, or null */
  knownGap: string | null;
};

export type RuleResult = {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
};
