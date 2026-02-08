/**
 * Library of common lambda calculus expressions (Church encodings)
 */

const EXPRESSIONS = {
    // Boolean logic
    TRUE: {
        name: 'TRUE',
        description: 'Church encoding of true',
        expression: ':x y.x'
    },
    FALSE: {
        name: 'FALSE', 
        description: 'Church encoding of false',
        expression: ':x y.y'
    },
    AND: {
        name: 'AND',
        description: 'Logical AND',
        expression: ':p q.p q p'
    },
    OR: {
        name: 'OR',
        description: 'Logical OR',
        expression: ':p q.p p q'
    },
    NOT: {
        name: 'NOT',
        description: 'Logical NOT',
        expression: ':p.p (:x y.y) (:x y.x)'
    },
    IF: {
        name: 'IF',
        description: 'If-then-else',
        expression: ':p a b.p a b'
    },
    
    // Church numerals
    ZERO: {
        name: '0',
        description: 'Church numeral zero',
        expression: ':f x.x'
    },
    ONE: {
        name: '1',
        description: 'Church numeral one',
        expression: ':f x.f x'
    },
    TWO: {
        name: '2',
        description: 'Church numeral two',
        expression: ':f x.f (f x)'
    },
    THREE: {
        name: '3',
        description: 'Church numeral three',
        expression: ':f x.f (f (f x))'
    },
    
    // Arithmetic
    SUCC: {
        name: 'SUCC',
        description: 'Successor function',
        expression: ':n f x.f (n f x)'
    },
    PLUS: {
        name: 'PLUS',
        description: 'Addition',
        expression: ':m n f x.m f (n f x)'
    },
    MULT: {
        name: 'MULT',
        description: 'Multiplication',
        expression: ':m n f.m (n f)'
    },
    
    // Pairs
    PAIR: {
        name: 'PAIR',
        description: 'Create a pair',
        expression: ':a b f.f a b'
    },
    FST: {
        name: 'FST',
        description: 'First element of pair',
        expression: ':p.p (:x y.x)'
    },
    SND: {
        name: 'SND',
        description: 'Second element of pair',
        expression: ':p.p (:x y.y)'
    },
    
    // Combinators
    I: {
        name: 'I',
        description: 'Identity combinator',
        expression: ':x.x'
    },
    K: {
        name: 'K',
        description: 'Constant combinator',
        expression: ':x y.x'
    },
    S: {
        name: 'S',
        description: 'Substitution combinator',
        expression: ':x y z.x z (y z)'
    },
    OMEGA: {
        name: 'omega',
        description: 'Self-application (diverges)',
        expression: ':x.x x'
    },
    Y: {
        name: 'Y',
        description: 'Y combinator (fixed-point)',
        expression: ':f.(:x.f (x x)) (:x.f (x x))'
    }
};

// Examples that demonstrate interesting reductions
const EXAMPLES = [
    {
        name: 'TRUE FALSE',
        description: 'Apply TRUE to FALSE - reduces to first argument',
        expression: '(:x y.x) (:a b.b)'
    },
    {
        name: 'NOT TRUE',
        description: 'Negate TRUE - reduces to FALSE',
        expression: '(:p.p (:x y.y) (:x y.x)) (:a b.a)'
    },
    {
        name: 'SUCC 1',
        description: 'Successor of 1 - reduces to 2',
        expression: '(:n f x.f (n f x)) (:f x.f x)'
    },
    {
        name: '1 + 1',
        description: 'Add two ones',
        expression: '(:m n f x.m f (n f x)) (:f x.f x) (:f x.f x)'
    },
    {
        name: 'Identity',
        description: 'Identity combinator applied to itself',
        expression: '(:x.x) (:x.x)'
    },
    {
        name: 'K combinator',
        description: 'K applied to two terms',
        expression: '(:x y.x) a b'
    },
    {
        name: 'Y Y',
        description: 'Y combinator applied to itself',
        expression: '(:f.(:x.f (x x)) (:x.f (x x))) (:f.(:x.f (x x)) (:x.f (x x)))'
    },
    {
        name: 'NOT TRUE (macro)',
        description: 'Boolean NOT TRUE using macros — expand editor to see definitions',
        expression: 'TRUE = :x y.x\nFALSE = :x y.y\nNOT = :p.p FALSE TRUE\nNOT TRUE'
    },
    {
        name: '2 + 2 (macro)',
        description: 'Church arithmetic 2+2 using macros',
        expression: '+ = :m n f x.m f (n f x)\n2 = :f x.f (f x)\n+ 2 2'
    }
];

/**
 * Populates the example list in the UI
 */
function populateExamples() {
    const container = document.getElementById('example-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    EXAMPLES.forEach(example => {
        const item = document.createElement('div');
        item.className = 'example-item';
        item.title = example.description;
        item.innerHTML = `
            <span class="example-name">${example.name}</span>
            <span class="example-code">${truncate(example.expression, 20)}</span>
        `;
        item.addEventListener('click', () => loadExample(example.expression));
        container.appendChild(item);
    });
}

/**
 * Loads an example expression into the input and visualizes it
 */
function loadExample(expression) {
    const input = document.getElementById('lambdaString');
    if (input) {
        input.value = expression;
    }
    // Auto-expand editor for multi-line macro examples
    if (expression.includes('\n') && typeof expanded !== 'undefined' && !expanded) {
        document.getElementById('expand-btn').click();
    }
    parseAndLoad();
}

/**
 * Truncates a string to a maximum length
 */
function truncate(str, maxLength) {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 1) + '...';
}
