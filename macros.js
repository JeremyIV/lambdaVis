/**
 * Macro expansion for lambda calculus expressions.
 *
 * Supports multi-line input where lines containing `=` define macros
 * (NAME = expression) and the final non-macro line is the main expression.
 * Macros expand by textual substitution before parsing.
 */

/**
 * Replace all whole-token occurrences of `name` in `str` with `(body)`.
 * Token boundaries: start/end of string, whitespace, parens, colon, dot, equals.
 */
function expandMacroInString(str, name, body) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(
        '(?<=^|[\\s():.=])' + escaped + '(?=$|[\\s():.=])',
        'g'
    );
    return str.replace(re, '(' + body + ')');
}

/**
 * Process multi-line input, expanding macro definitions into the final expression.
 *
 * @param {string} input - Raw textarea content (possibly multi-line)
 * @returns {string} A single expanded lambda expression ready for the parser
 */
function expandMacros(input) {
    const lines = input.split('\n');

    const macros = [];       // { name, body } in definition order
    const exprLines = [];    // non-macro, non-empty lines

    for (const raw of lines) {
        const line = raw.trim();
        if (line === '') continue;

        const eqIndex = line.indexOf('=');
        if (eqIndex !== -1) {
            const name = line.slice(0, eqIndex).trim();
            let body = line.slice(eqIndex + 1).trim();

            if (name === '' || body === '') continue; // malformed, skip

            // Expand all previously-defined macros into this body
            for (const m of macros) {
                body = expandMacroInString(body, m.name, m.body);
            }

            macros.push({ name, body });
        } else {
            exprLines.push(line);
        }
    }

    // If there are no expression lines, return input unchanged (single-line, no macros)
    if (exprLines.length === 0) return input.trim();

    let expr = exprLines.join(' ');

    // Expand all macros in the final expression
    for (const m of macros) {
        expr = expandMacroInString(expr, m.name, m.body);
    }

    return expr;
}
