export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export const MEAL_TYPES: { value: MealType; label: string; icon: string }[] = [
  { value: "breakfast", label: "朝食", icon: "🌅" },
  { value: "lunch", label: "昼食", icon: "☀️" },
  { value: "dinner", label: "夕食", icon: "🌙" },
  { value: "snack", label: "間食", icon: "🍙" },
];

export type Nutrients = { kcal: number; protein: number; fat: number; carbs: number };

export type Profile = {
  id: string;
  display_name: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  age: number | null;
  sex: "male" | "female" | null;
  activity_level: ActivityLevel | null;
  goal: Goal | null;
  diet_style: DietStyle;
  target_kcal: number | null;
  target_protein: number | null;
  target_fat: number | null;
  target_carbs: number | null;
  onboarded: boolean;
};

export type ActivityLevel = "low" | "light" | "moderate" | "high" | "very_high";
export type Goal = "lose" | "maintain" | "gain";
export type DietStyle = "balanced" | "low_fat";

export type MealEntry = Nutrients & {
  id: string;
  eaten_on: string;
  meal_type: MealType;
  name: string;
  amount: string | null;
  created_at: string;
};

export type Food = Nutrients & { id: string; name: string; unit: string };

export type Recipe = { id: string; name: string; note: string | null };
export type RecipeIngredient = Nutrients & {
  id: string;
  recipe_id: string;
  name: string;
  amount: string | null;
};

export type WeightLog = { id: string; logged_on: string; weight_kg: number };
