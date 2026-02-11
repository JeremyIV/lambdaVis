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
	if (obj === null || typeof obj !== 'object') return obj;
	const copy = {};
	for (const key in obj) {
		const val = obj[key];
		copy[key] = (val !== null && typeof val === 'object') ? deepCopy(val) : val;
	}
	return copy;
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

/**
 * Count the number of nodes in an expression tree.
 */
function treeSize(node) {
	if (!node) return 0;
	if (node.type === VARIABLE) return 1;
	if (node.type === LAMBDA) return 1 + treeSize(node.expression);
	if (node.type === APPLICATION) return 1 + treeSize(node.left) + treeSize(node.right);
	return 1;
}

/**
 * Check if two lambda calculus expressions are alpha-equivalent
 * (structurally identical up to consistent renaming of bound variables).
 */
function alphaEquivalent(a, b) {
	return alphaEquivHelper(a, b, {}, {});
}

function alphaEquivHelper(a, b, aToB, bToA) {
	if (a.type !== b.type) return false;

	if (a.type === VARIABLE) {
		const aMapped = aToB[a.id];
		const bMapped = bToA[b.id];
		if (aMapped !== undefined || bMapped !== undefined) {
			return aMapped === b.id && bMapped === a.id;
		}
		return a.id === b.id;
	}

	if (a.type === LAMBDA) {
		const newAToB = { ...aToB, [a.id]: b.id };
		const newBToA = { ...bToA, [b.id]: a.id };
		return alphaEquivHelper(a.expression, b.expression, newAToB, newBToA);
	}

	if (a.type === APPLICATION) {
		return alphaEquivHelper(a.left, b.left, aToB, bToA) &&
		       alphaEquivHelper(a.right, b.right, aToB, bToA);
	}

	return false;
}
