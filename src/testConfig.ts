/**
 * Change these when scheduling a new test window.
 * Times are interpreted in the user's local timezone unless you use UTC strings.
 */
export const TEST_WINDOW_START = new Date("2026-04-04T02:30:00");
/** Official end of the test slot (informational; in-app timer uses TEST_DURATION_SECONDS). */
export const TEST_WINDOW_END = new Date("2026-04-04T02:35:00");

/** Allowed working time on the test page (2 h 30 min = 150 min). */
export const TEST_DURATION_SECONDS = 150 * 60;

export const TOTAL_MARKS = 100;
export const PASS_MARK = 70;

/** Shown on the landing page (referral details). */
export const REFERRAL_TYPE_LABEL = "Employee referral";
export const REFERRER_EMPLOYEE_EMAIL = "prince.devadoss@freshworks.com";
export const REFERRER_EMPLOYEE_NAME = "Prince Devadoss";

export const MATHS_TOPICS = [
  "Number Systems",
  "Polynomials",
  "Coordinate Geometry",
  "Linear Equations in Two Variables",
  "Euclid’s Geometry",
  "Lines and Angles",
  "Triangles",
  "Quadrilaterals",
  "Areas of Parallelograms and Triangles",
  "Circles",
  "Constructions",
  "Heron’s Formula",
  "Surface Areas and Volumes",
  "Statistics",
  "Probability",
] as const;

export const PHYSICS_TOPICS = [
  "Motion",
  "Laws of Motion",
  "Gravitation",
  "Work and Energy",
  "Sound",
] as const;

export const CHEMISTRY_TOPICS = [
  "Matter in Our Surroundings",
  "Is Matter Around Us Pure",
  "Atoms and Molecules",
  "Structure of the Atom",
  "Basic Chemical Reactions",
] as const;

export type Subject = "Maths" | "Physics" | "Chemistry";

export interface QuestionItem {
  id: number;
  subject: Subject;
  type: "mcq" | "fill";
  question: string;
  options?: string[];
  answer: string;
}
