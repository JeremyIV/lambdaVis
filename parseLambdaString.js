/**
 * Alternative parser for prefix notation: @ for application, : for lambda
 * Example: @:x:y x :x:y y  represents (λx.λy.x)(λx.λy.y)
 */

/**
 * Parses a variable in prefix notation.
 */
function parsePrefixVariable(consumableString) {
	const string = consumableString[0].trim();
	const match = /^[^@:\s]+/.exec(string);
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
 * Parses a lambda in prefix notation.
 */
function parsePrefixLambda(consumableString) {
	const string = consumableString[0].trim();
	const match = /^:\s*([^@:\s]+)/.exec(string);
	if (match === null) {
		console.error("failed to parse lambda from: " + string);
		throw new Error("Parse failure: invalid lambda");
	}
	const id = match[1];
	consumableString[0] = string.substring(match[0].length);
	return {
		type: LAMBDA,
		id: id,
		expression: parsePrefixExpression(consumableString)
	};
}

/**
 * Parses an application in prefix notation.
 */
function parsePrefixApplication(consumableString) {
	const string = consumableString[0].trim();
	const match = /^@/.exec(string);
	if (match === null) {
		console.error("failed to parse application from: " + string);
		throw new Error("Parse failure: invalid application");
	}
	consumableString[0] = string.substring(match[0].length);
	return {
		type: APPLICATION,
		left: parsePrefixExpression(consumableString),
		right: parsePrefixExpression(consumableString)
	};
}

/**
 * Parses an expression in prefix notation.
 */
function parsePrefixExpression(consumableString) {
	const string = consumableString[0].trim();
	if (/^:/.exec(string) !== null) {
		return parsePrefixLambda(consumableString);
	}
	if (/^@/.exec(string) !== null) {
		return parsePrefixApplication(consumableString);
	}
	return parsePrefixVariable(consumableString);
}

/**
 * Converts an expression to prefix notation string.
 */
function expressionToPrefixString(expression) {
	const type = expression.type;
	if (type === VARIABLE) {
		return expression.id;
	}
	if (type === LAMBDA) {
		return ':' + expression.id + ' ' + expressionToPrefixString(expression.expression);
	}
	if (type === APPLICATION) {
		return '@ ' + expressionToPrefixString(expression.left) + 
		       ' ' + expressionToPrefixString(expression.right);
	}
	console.error("unrecognized type for:", expression);
	throw new Error("Unrecognized expression type");
}