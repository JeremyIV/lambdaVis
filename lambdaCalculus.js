/**
 * Finds and performs one beta reduction step in the expression tree.
 * Uses leftmost-outermost (normal order) reduction strategy.
 * Performs betaReduce but does NOT call copyInto, so the caller can
 * render the intermediate state before completing the reduction.
 * @param {Object} root - The expression AST root
 * @param {Object} parentVars - Map of variable names in scope
 * @returns {{applicationNode: Object, reducedExpression: Object}|false}
 */
function findAndReduce(root, parentVars) {
	const type = root.type;

	if (type === VARIABLE) {
		return false;
	}

	if (type === LAMBDA) {
		const prev = parentVars[root.id];
		parentVars[root.id] = true;
		const reduced = findAndReduce(root.expression, parentVars);
		if (prev !== undefined) {
			parentVars[root.id] = prev;
		} else {
			delete parentVars[root.id];
		}
		return reduced;
	}

	if (type === APPLICATION) {
		// Check if this is a redex (application of lambda)
		if (root.left.type === LAMBDA) {
			const subId = root.left.id;
			// If the variable is used more than once in the body, reduce the
			// argument first to avoid exponential blowup from duplicating
			// unreduced expressions (e.g. Y combinator recursive calls).
			if (countVarUses(root.left.expression, subId) > 1) {
				const argReduction = findAndReduce(root.right, parentVars);
				if (argReduction) return argReduction;
			}
			const expressionToReduce = root.left.expression;
			const subExpression = root.right;
			const freeVars = collectFreeVars(subExpression);
			betaReduce(expressionToReduce, subId, subExpression, parentVars, freeVars);
			return { applicationNode: root, reducedExpression: expressionToReduce };
		}
		// Otherwise, try to reduce in left subtree, then right
		return findAndReduce(root.left, parentVars) ||
		       findAndReduce(root.right, parentVars);
	}

	return false;
}

/**
 * Collect all free variable names in an expression.
 */
function collectFreeVars(node, bound) {
	if (!bound) bound = new Set();
	const free = new Set();
	if (node.type === VARIABLE) {
		if (!bound.has(node.id)) free.add(node.id);
	} else if (node.type === LAMBDA) {
		const innerBound = new Set(bound);
		innerBound.add(node.id);
		for (const v of collectFreeVars(node.expression, innerBound)) free.add(v);
	} else if (node.type === APPLICATION) {
		for (const v of collectFreeVars(node.left, bound)) free.add(v);
		for (const v of collectFreeVars(node.right, bound)) free.add(v);
	}
	return free;
}

/**
 * Collect all variable names (free and bound) in an expression.
 */
function collectAllNames(node, names) {
	if (!names) names = new Set();
	if (node.type === VARIABLE) {
		names.add(node.id);
	} else if (node.type === LAMBDA) {
		names.add(node.id);
		collectAllNames(node.expression, names);
	} else if (node.type === APPLICATION) {
		if (node.left) collectAllNames(node.left, names);
		if (node.right) collectAllNames(node.right, names);
	}
	return names;
}

/**
 * Count occurrences of a variable in an expression (stops at shadowing lambdas).
 */
function countVarUses(node, varId) {
	if (node.type === VARIABLE) {
		return node.id === varId ? 1 : 0;
	} else if (node.type === LAMBDA) {
		if (node.id === varId) return 0; // shadowed
		return countVarUses(node.expression, varId);
	} else if (node.type === APPLICATION) {
		return countVarUses(node.left, varId) + countVarUses(node.right, varId);
	}
	return 0;
}

/**
 * Rename all bound occurrences of oldId to newId within a lambda body.
 * Stops at inner lambdas that shadow the name.
 */
function renameInBody(node, oldId, newId) {
	if (node.type === VARIABLE) {
		if (node.id === oldId) node.id = newId;
	} else if (node.type === LAMBDA) {
		if (node.id === oldId) return; // shadowed
		renameInBody(node.expression, oldId, newId);
	} else if (node.type === APPLICATION) {
		if (node.left) renameInBody(node.left, oldId, newId);
		if (node.right) renameInBody(node.right, oldId, newId);
	}
}

/**
 * Performs beta reduction: substitutes all occurrences of a variable
 * with the given expression.
 * @param {Object} root - The expression to traverse
 * @param {string} id - The variable name to replace
 * @param {Object} sub - The substitute expression
 * @param {Object} parentVars - Map of variable names in scope (for alpha conversion)
 * @param {Set} freeVars - Free variable names in the substitute expression
 */
function betaReduce(root, id, sub, parentVars, freeVars) {
	const type = root.type;

	if (type === VARIABLE) {
		if (root.id === id) {
			// Remember the old variable's uid so the renderer can
			// animate the substituted copy from the variable's position
			const oldUid = root.uid;
			// Clear the variable object
			for (const key in root) {
				delete root[key];
			}
			// Deep copy the substitute expression
			const subCopy = deepCopy(sub);
			// Alpha-rename to avoid variable capture
			alphaSubstitute(subCopy, parentVars, {});
			// Copy the substitute into this node
			for (const key in subCopy) {
				root[key] = subCopy[key];
			}
			// Tag the root of the substituted copy with the old variable's uid
			if (oldUid !== undefined) {
				root.replacedUid = oldUid;
			}
		}
	} else if (type === LAMBDA) {
		// Direction 2 capture: if this lambda's variable is free in the
		// substitute, rename it to prevent the substitute's free variable
		// from being captured by this binding.
		if (root.id !== id && freeVars.has(root.id)) {
			const bodyNames = collectAllNames(root.expression);
			let suffix = 1;
			let newName = root.id + suffix;
			while (parentVars[newName] !== undefined || freeVars.has(newName) || bodyNames.has(newName)) {
				suffix++;
				newName = root.id + suffix;
			}
			renameInBody(root.expression, root.id, newName);
			root.id = newName;
		}
		const prev = parentVars[root.id];
		parentVars[root.id] = true;
		betaReduce(root.expression, id, sub, parentVars, freeVars);
		if (prev !== undefined) {
			parentVars[root.id] = prev;
		} else {
			delete parentVars[root.id];
		}
	} else if (type === APPLICATION) {
		betaReduce(root.left, id, sub, parentVars, freeVars);
		betaReduce(root.right, id, sub, parentVars, freeVars);
	}
}

/**
 * Performs alpha substitution to rename variables that would be captured.
 * Also clears UIDs to force regeneration.
 * @param {Object} root - The expression to traverse
 * @param {Object} parentVars - Map of variable names already in scope
 * @param {Object} substitutions - Map from old names to new names
 */
function alphaSubstitute(root, parentVars, substitutions) {
	const type = root.type;

	// Clear UID to force regeneration
	delete root.uid;

	if (type === VARIABLE) {
		const substitution = substitutions[root.id];
		if (substitution !== undefined) {
			root.id = substitution;
		}
	} else if (type === LAMBDA) {
		const id = root.id;
		if (parentVars[id] !== undefined) {
			// Need to rename this variable to avoid capture
			let suffix = 1;
			let newName = id + suffix;
			while (parentVars[newName] !== undefined) {
				suffix++;
				newName = id + suffix;
			}
			root.id = newName;
			const prevSub = substitutions[id];
			substitutions[id] = newName;
			parentVars[newName] = true;
			alphaSubstitute(root.expression, parentVars, substitutions);
			if (prevSub !== undefined) {
				substitutions[id] = prevSub;
			} else {
				delete substitutions[id];
			}
			delete parentVars[newName];
		} else {
			alphaSubstitute(root.expression, parentVars, substitutions);
		}
	} else if (type === APPLICATION) {
		alphaSubstitute(root.left, parentVars, substitutions);
		alphaSubstitute(root.right, parentVars, substitutions);
	}
}
