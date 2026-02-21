export type ResourceType =
  | "log"
  | "planks"
  | "sticks"
  | "cobblestone"
  | "coal"
  | "raw_iron"
  | "iron_ingot";

export type ProgressionTaskId =
  | "collect_logs"
  | "craft_planks"
  | "craft_sticks"
  | "craft_crafting_table"
  | "craft_wooden_pickaxe"
  | "collect_cobblestone"
  | "craft_stone_pickaxe"
  | "collect_coal"
  | "collect_raw_iron"
  | "smelt_iron"
  | "craft_iron_pickaxe";

export type ProgressionTask = {
  id: ProgressionTaskId;
  description: string;
  prerequisiteTaskIds: ReadonlyArray<ProgressionTaskId>;
  requiredResourceTypes: ReadonlyArray<ResourceType>;
};

const DEFAULT_PROGRESSION_PLAN: ReadonlyArray<ProgressionTask> = [
  { id: "collect_logs", description: "Collect nearby wood logs.", prerequisiteTaskIds: [], requiredResourceTypes: [] },
  { id: "craft_planks", description: "Craft wood planks from logs.", prerequisiteTaskIds: ["collect_logs"], requiredResourceTypes: ["log"] },
  { id: "craft_sticks", description: "Craft sticks for tools.", prerequisiteTaskIds: ["craft_planks"], requiredResourceTypes: ["planks"] },
  { id: "craft_crafting_table", description: "Craft and place crafting table.", prerequisiteTaskIds: ["craft_planks"], requiredResourceTypes: ["planks"] },
  { id: "craft_wooden_pickaxe", description: "Craft first pickaxe.", prerequisiteTaskIds: ["craft_sticks", "craft_crafting_table"], requiredResourceTypes: ["sticks", "planks"] },
  { id: "collect_cobblestone", description: "Mine cobblestone for stone tier tools.", prerequisiteTaskIds: ["craft_wooden_pickaxe"], requiredResourceTypes: ["cobblestone"] },
  { id: "craft_stone_pickaxe", description: "Upgrade to stone pickaxe.", prerequisiteTaskIds: ["collect_cobblestone"], requiredResourceTypes: ["cobblestone", "sticks"] },
  { id: "collect_coal", description: "Mine coal for smelting and torches.", prerequisiteTaskIds: ["craft_stone_pickaxe"], requiredResourceTypes: ["coal"] },
  { id: "collect_raw_iron", description: "Mine raw iron ore.", prerequisiteTaskIds: ["craft_stone_pickaxe"], requiredResourceTypes: ["raw_iron"] },
  { id: "smelt_iron", description: "Smelt raw iron into iron ingots.", prerequisiteTaskIds: ["collect_coal", "collect_raw_iron"], requiredResourceTypes: ["coal", "raw_iron"] },
  { id: "craft_iron_pickaxe", description: "Craft iron pickaxe for progression.", prerequisiteTaskIds: ["smelt_iron"], requiredResourceTypes: ["iron_ingot", "sticks"] }
];

const hasCompletedPrerequisites = (
  task: ProgressionTask,
  completedTaskIds: ReadonlySet<ProgressionTaskId>
): boolean => task.prerequisiteTaskIds.every((taskId) => completedTaskIds.has(taskId));

const hasDiscoveredResources = (
  task: ProgressionTask,
  discoveredResources: ReadonlySet<ResourceType>
): boolean => task.requiredResourceTypes.every((resourceType) => discoveredResources.has(resourceType));

export const getDefaultProgressionPlan = (): ReadonlyArray<ProgressionTask> => DEFAULT_PROGRESSION_PLAN;

export const getAvailableProgressionTasks = (
  completedTaskIds: ReadonlySet<ProgressionTaskId>,
  discoveredResources: ReadonlySet<ResourceType>
): ReadonlyArray<ProgressionTask> => {
  return DEFAULT_PROGRESSION_PLAN.filter((task) => {
    if (completedTaskIds.has(task.id)) return false;
    if (!hasCompletedPrerequisites(task, completedTaskIds)) return false;
    return hasDiscoveredResources(task, discoveredResources);
  });
};
