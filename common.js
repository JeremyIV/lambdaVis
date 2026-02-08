// Lambda calculus expression types
const VARIABLE = "variable";
const LAMBDA = "lambda";
const APPLICATION = "application";

/**
 * Creates a deep copy of an object using JSON serialization.
 * @param {Object} obj - The object to copy
 * @returns {Object} A deep copy of the object
 */
function deepCopy(obj) {
	return JSON.parse(JSON.stringify(obj));
}

/**
 * Clears the target object and shallow-copies the contents of source into it.
 * @param {Object} target - The object to clear and fill
 * @param {Object} source - The object to copy from
 */
function copyInto(target, source) {
	for (const key in target) {
		delete target[key];
	}
	for (const key in source) {
		target[key] = source[key];
	}
}
