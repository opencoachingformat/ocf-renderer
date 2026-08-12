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

export interface Meta {
  id: string;
  title: string;
}

export interface NamedCoordinate { named: string; }
export interface RelativeCoordinate { relative_to: string; dx: number; dy: number; }
export interface FreeCoordinate { x: number; y: number; }
export type Coordinate = NamedCoordinate | RelativeCoordinate | FreeCoordinate;

export type ColorRole =
  | "offense" | "defense" | "black" | "grey" | "yellow" | "green" | "red" | "blue" | "white";

// Entities — no `id` field; ref is derived via entityRef() from type(+nr).
export interface OffenseEntity {
  type: "offense";
  nr: number; // 1-9
  x: number;
  y: number;
  rotation?: number;
  color?: ColorRole;
  label?: string;
}
export interface DefenseEntity {
  type: "defense";
  nr: number; // 1-9
  x: number;
  y: number;
  rotation?: number;
  color?: ColorRole;
  label?: string;
}
export interface CoachEntity {
  type: "coach";
  x: number;
  y: number;
}
export interface ConeEntity {
  type: "cone";
  nr: number;
  x: number;
  y: number;
}
export interface StationEntity {
  type: "station";
  nr: number;
  label?: string;
  x: number;
  y: number;
}
export type Entity = OffenseEntity | DefenseEntity | CoachEntity | ConeEntity | StationEntity;

/** Derives the schema's entity_ref string (e.g. "offense_1", "coach") from an Entity. */
export function entityRef(entity: Entity): string {
  return entity.type === "coach" ? "coach" : `${entity.type}_${entity.nr}`;
}

export type BallState =
  | { carried_by: string }
  | { at: Coordinate }
  | { dead: true };

export interface Ball {
  id: string; // ball_ref, e.g. "ball_1"
  // exactly one of carried_by / at / dead is present, same union as BallState:
  carried_by?: string;
  at?: Coordinate;
  dead?: true;
}

// Flat state map: entity_ref -> Coordinate, plus a reserved `balls` key.
export interface FrameState {
  balls?: Record<string, BallState>;
  [entityRef: string]: Coordinate | Record<string, BallState> | undefined;
}

export type MovementIntensity = "slow" | "normal" | "fast" | "explosive";
export type BallIntensity = "soft" | "normal" | "hard" | "bullet";
export type Physicality = "passive" | "normal" | "aggressive" | "hard";

export interface MoveStep {
  variant?: string;
  to?: Coordinate; // omitted = move on the spot
  around_player?: string;
  off_screen_by?: string;
  intensity?: MovementIntensity; // overrides the action-level intensity for this step
}

export type CutVariant =
  | "backdoor" | "give_and_go" | "flash" | "v_cut" | "l_cut" | "curl" | "flare" | "fade" | "basket";
export type PassVariant =
  | "chest" | "bounce" | "overhead" | "lob" | "baseball" | "hand_off" | "outlet";
export type ShootVariant =
  | "jumper" | "three" | "layup" | "floater" | "dunk" | "hook" | "free_throw";
export type ScreenVariant =
  | "ball_screen" | "back_screen" | "down_screen" | "flare_screen" | "cross_screen" | "pin_down";
export type DefendVariant = "on_ball" | "deny" | "help" | "hedge" | "switch" | "box_out";
export type ReboundVariant = "offensive" | "defensive";

interface ActionCommon {
  player: string; // entity_ref
  tags?: string[];
  after?: string; // action_ref
  with?: string; // action_ref
  on_catch?: boolean;
}

export type Action =
  | (ActionCommon & { type: "move"; moves: MoveStep[]; intensity?: MovementIntensity })
  | (ActionCommon & { type: "cut"; moves: MoveStep[]; variant?: CutVariant; around_player?: string; off_screen_by?: string; intensity?: MovementIntensity })
  | (ActionCommon & { type: "dribble"; moves: MoveStep[]; ball_id?: string; intensity?: MovementIntensity })
  | (ActionCommon & { type: "pass"; to_player: string; ball_id?: string; variant?: PassVariant; intensity?: BallIntensity })
  | (ActionCommon & { type: "shoot"; ball_id?: string; variant?: ShootVariant; result?: "make" | "miss"; intensity?: BallIntensity })
  | (ActionCommon & { type: "screen"; for_player: string; on_player?: string; at?: Coordinate; variant?: ScreenVariant; physicality?: Physicality })
  | (ActionCommon & { type: "defend"; guards_player: string; variant?: DefendVariant; physicality?: Physicality })
  | (ActionCommon & { type: "rebound"; ball_id?: string; variant?: ReboundVariant; physicality?: Physicality })
  | (ActionCommon & { type: "pickup"; ball_id: string; physicality?: Physicality });

export interface Frame {
  id: string;
  label?: string;
  description?: string;
  duration_ms?: number; // deprecated upstream; parsed, unused
  start_state?: FrameState;
  actions: Action[];
  end_state: FrameState;
  branches?: Record<string, unknown>; // unused structural field, no traversal logic
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
  meta: Meta;
  court: Court;
  entities: Entity[];
  balls?: Ball[];
  frames: Frame[];
  color_scheme?: ColorScheme;
}
