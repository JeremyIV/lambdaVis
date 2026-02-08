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
		parentVars[root.id] = true;
		const reduced = findAndReduce(root.expression, parentVars);
		delete parentVars[root.id];
		return reduced;
	}

	if (type === APPLICATION) {
		// Check if this is a redex (application of lambda)
		if (root.left.type === LAMBDA) {
			const expressionToReduce = root.left.expression;
			const subId = root.left.id;
			const subExpression = root.right;
			betaReduce(expressionToReduce, subId, subExpression, parentVars);
			return { applicationNode: root, reducedExpression: expressionToReduce };
		}
		// Otherwise, try to reduce in left subtree, then right
		return findAndReduce(root.left, parentVars) ||
		       findAndReduce(root.right, parentVars);
	}

	return false;
}

/**
 * Performs beta reduction: substitutes all occurrences of a variable
 * with the given expression.
 * @param {Object} root - The expression to traverse
 * @param {string} id - The variable name to replace
 * @param {Object} sub - The substitute expression
 * @param {Object} parentVars - Map of variable names in scope (for alpha conversion)
 */
function betaReduce(root, id, sub, parentVars) {
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
		parentVars[root.id] = true;
		betaReduce(root.expression, id, sub, parentVars);
		delete parentVars[root.id];
	} else if (type === APPLICATION) {
		betaReduce(root.left, id, sub, parentVars);
		betaReduce(root.right, id, sub, parentVars);
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
			substitutions[id] = newName;
			parentVars[newName] = true;
			alphaSubstitute(root.expression, parentVars, substitutions);
			delete substitutions[id];
			delete parentVars[newName];
		} else {
			alphaSubstitute(root.expression, parentVars, substitutions);
		}
	} else if (type === APPLICATION) {
		alphaSubstitute(root.left, parentVars, substitutions);
		alphaSubstitute(root.right, parentVars, substitutions);
	}
}