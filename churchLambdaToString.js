/**
 * Converts a lambda AST node to string representation.
 * Collapses nested lambdas into multi-parameter form: :x y z.body
 * @param {Object} lambda - Lambda AST node
 * @returns {string} String representation
 */
function lambdaToString(lambda) {
	let str = ':' + lambda.id;
	let expression = lambda.expression;
	while (expression.type === LAMBDA) {
		str += ' ' + expression.id;
		expression = expression.expression;
	}
	return str + '.' + expressionToString(expression);
}

/**
 * Converts an application AST node to string representation.
 * @param {Object} application - Application AST node
 * @returns {string} String representation
 */
function applicationToString(application) {
	const str = expressionToString(application.left);
	const rightStr = expressionToString(application.right);
	if (application.right.type === APPLICATION) {
		return str + '(' + rightStr + ')';
	}
	return str + ' ' + rightStr;
}

/**
 * Converts any expression AST node to string representation.
 * @param {Object} expression - Any expression AST node
 * @returns {string} String representation
 */
function expressionToString(expression) {
	if (expression.type === VARIABLE) {
		return expression.id;
	}
	if (expression.type === LAMBDA) {
		return lambdaToString(expression);
	}
	if (expression.type === APPLICATION) {
		return applicationToString(expression);
	}
	console.error("Unrecognized type:", expression);
	throw new Error("Unrecognized expression type");
}