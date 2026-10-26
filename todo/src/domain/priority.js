// Task priority levels, lowest first. 'none' is the default for new and older stored tasks.
export const PRIORITIES = ['none', 'low', 'medium', 'high'];

export const isPriority = (value) => PRIORITIES.includes(value);
