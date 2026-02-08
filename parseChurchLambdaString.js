/**
 * Parses a variable from the consumable string.
 * @param {string[]} consumableString - Array with single string element (mutated during parsing)
 * @returns {Object} Variable AST node
 */
function parseVariable(consumableString) {
	const string = consumableString[0].trim();
	const match = /^[^\(\):\s]+/.exec(string);
	if (match === null) {
		console.error("failed to parse variable from: " + string);
		throw new Error("Parse failure: invalid variable");
	}
	const id = match[0];
	consumableString[0] = string.substring(id.length);
	return {
		type: VARIABLE,
		id: id
	};
}

/**
 * Parses a lambda expression from the consumable string.
 * Supports multi-parameter lambdas like :x y z.body
 * @param {string[]} consumableString - Array with single string element (mutated during parsing)
 * @returns {Object} Lambda AST node (possibly nested for multi-param)
 */
function parseLambda(consumableString) {
	const string = consumableString[0].trim();
	const match = /^:\s*([^\(\)\.:\s][^\(\)\.:]*)\./.exec(string);
	if (match === null) {
		console.error("Could not parse lambda from: " + string);
		throw new Error("Parse error: invalid lambda syntax");
	}
	const ids = match[1].match(/\S+/g);
	consumableString[0] = string.substring(match[0].length);
	const expression = parseExpression(consumableString);
	return lambdaChain(ids, expression);
}

/**
 * Creates a chain of nested lambda nodes for multi-parameter lambdas.
 * @param {string[]} ids - Parameter names
 * @param {Object} expression - The body expression
 * @returns {Object} Nested lambda AST nodes
 */
function lambdaChain(ids, expression) {
	if (ids.length === 0) {
		return expression;
	}
	return {
		type: LAMBDA,
		id: ids[0],
		expression: lambdaChain(ids.slice(1), expression)
	};
}

/**
 * Parses a parenthetical expression.
 * @param {string[]} consumableString - Array with single string element (mutated during parsing)
 * @returns {Object} The parsed expression inside parentheses
 */
function parseParenthetical(consumableString) {
	let string = consumableString[0].trim();
	if (string[0] !== '(') {
		console.error("Expected '(', got " + string);
		throw new Error("Parse error: expected '('");
	}
	consumableString[0] = string.substring(1);
	const expression = parseExpression(consumableString);
	string = consumableString[0].trim();
	if (string[0] !== ')') {
		console.error("Expected ')', got " + string);
		throw new Error("Parse error: expected ')'");
	}
	consumableString[0] = string.substring(1);
	return expression;
}

/**
 * Parses a complete expression (may contain multiple terms forming applications).
 * @param {string[]} consumableString - Array with single string element (mutated during parsing)
 * @returns {Object} The parsed expression AST
 */
function parseExpression(consumableString) {
	let string = consumableString[0].trim();
	const expressions = [];
	while (string.length > 0 && string[0] !== ')') {
		if (string[0] === '(') {
			expressions.push(parseParenthetical(consumableString));
		} else if (string[0] === ':') {
			expressions.push(parseLambda(consumableString));
		} else if (/[^\(\):\s]/.exec(string[0]) !== null) {
			expressions.push(parseVariable(consumableString));
		} else {
			console.error("could not parse expression from: " + string);
			throw new Error("Parse error: unexpected character");
		}
		string = consumableString[0].trim();
	}
	return applicationChain(expressions);
}

/**
 * Creates a left-associative application chain from a list of expressions.
 * @param {Object[]} expressions - Array of expression AST nodes
 * @returns {Object} Application AST node (or single expression if length 1)
 */
function applicationChain(expressions) {
	if (expressions.length === 0) {
		console.error("empty expressions list");
		throw new Error("Parse error: empty expression");
	}
	if (expressions.length === 1) {
		return expressions[0];
	}
	return {
		type: APPLICATION,
		left: applicationChain(expressions.slice(0, expressions.length - 1)),
		right: expressions[expressions.length - 1]
	};
}