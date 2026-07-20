export type Ruleset = "fiba" | "nba" | "ncaa" | "nfhs" | "custom";
export type CourtType = "half_court" | "full_court";
export type Unit = "m" | "ft";

export interface CustomDimensions {
  length?: number;
  width?: number;
  basket_from_baseline?: number;
  three_point_distance?: number;
  paint_width?: number;
  paint_depth?: number;
  free_throw_distance?: number;
}

export interface Court {
  ruleset: Ruleset;
  type: CourtType;
  unit?: Unit;
  drill_focus?: "full" | "half";
  wheelchair?: boolean;
  custom_dimensions?: CustomDimensions;
}

export interface NamedCoordinate { named: string; }
export interface RelativeCoordinate { relative_to: string; dx: number; dy: number; }
export interface FreeCoordinate { x: number; y: number; }
export type Coordinate = NamedCoordinate | RelativeCoordinate | FreeCoordinate;

export type Handedness = "left_handed" | "right_handed";

export interface Entity {
  id: string;
  type: "offense" | "defense" | "coach" | "cone";
  number?: number;
  tags?: string[];
}

export interface EntityState {
  entity_ref: string;
  position: Coordinate;
  rotation?: number; // degrees, 0 = arms toward -y, clockwise (spec PR #5 convention)
}

export type BallState =
  | { status: "carried"; carried_by: string }
  | { status: "loose"; position: Coordinate };

export interface FrameState {
  entities: EntityState[];
  ball?: BallState;
}

export interface MoveStep { to: Coordinate; }

export type Action =
  | { type: "move" | "cut"; entity_ref: string; moves: MoveStep[] }
  | { type: "dribble"; entity_ref: string; moves: MoveStep[] }
  | { type: "pass" | "hand_off"; entity_ref: string; to_entity_ref: string }
  | { type: "screen"; entity_ref: string; at: Coordinate }
  | { type: "shoot"; entity_ref: string };

export interface Frame {
  id: string;
  start_state?: FrameState;
  end_state?: FrameState;
  actions?: Action[];
}

export interface ColorScheme {
  court_primary?: string;
  court_accent?: string;
  offense?: string;
  defense?: string;
  ball?: string;
  [key: string]: string | undefined;
}

export interface OcfDocument {
  version: string;
  court: Court;
  entities: Entity[];
  frames: Frame[];
  color_scheme?: ColorScheme;
}
