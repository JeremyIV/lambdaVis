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
        name: 'Identity',
        description: 'Identity combinator applied to itself — reduces to (:x.x)',
        expression: '(:x.x) (:x.x)'
    },
    {
        name: 'Omega',
        description: 'Self-application — each reduction reproduces the same expression (never terminates!)',
        expression: '(:x.x x) (:x.x x)'
    },
    {
        name: 'SKI Basis',
        description: 'S K K is the identity combinator — S K K a reduces to a',
        expression: [
            'S = :x y z.x z (y z)',
            'K = :x y.x',
            'S K K a'
        ].join('\n')
    },
    {
        name: 'Pairs',
        description: 'Church-encoded pairs — FST (PAIR a b) reduces to a',
        expression: [
            'PAIR = :a b f.f a b',
            'FST = :p.p (:x y.x)',
            'SND = :p.p (:x y.y)',
            'FST (PAIR a b)'
        ].join('\n')
    },
    {
        name: 'Boolean Logic',
        description: 'NOT (AND TRUE FALSE) using Church booleans — reduces to TRUE',
        expression: [
            'TRUE = :x y.x',
            'FALSE = :x y.y',
            'NOT = :p.p FALSE TRUE',
            'AND = :p q.p q p',
            'OR = :p q.p p q',
            'NOT (AND TRUE FALSE)'
        ].join('\n')
    },
    {
        name: 'Arithmetic',
        description: 'Church numeral addition 2 + 3 — reduces to 5',
        expression: [
            '0 = :f x.x',
            '1 = :f x.f x',
            '2 = :f x.f (f x)',
            '3 = :f x.f (f (f x))',
            '4 = :f x.f (f (f (f x)))',
            '5 = :f x.f (f (f (f (f x))))',
            '6 = :f x.f (f (f (f (f (f x)))))',
            '7 = :f x.f (f (f (f (f (f (f x))))))',
            '8 = :f x.f (f (f (f (f (f (f (f x)))))))',
            '9 = :f x.f (f (f (f (f (f (f (f (f x))))))))',
            '10 = :f x.f (f (f (f (f (f (f (f (f (f x)))))))))',
            'SUCC = :n f x.f (n f x)',
            '+ = :m n f x.m f (n f x)',
            'PRED = :n f x.n (:g h.h (g f)) (:u.x) (:u.u)',
            '- = :m n.n PRED m',
            'MULT = :m n f.m (n f)',
            'EXP = :b e.e b',
            '+ 2 3'
        ].join('\n')
    },
    {
        name: 'Conditional',
        description: 'IF (ISZERO 0) 1 2 — tests zero and branches, reduces to 1',
        expression: [
            'TRUE = :x y.x',
            'FALSE = :x y.y',
            '0 = :f x.x',
            '1 = :f x.f x',
            '2 = :f x.f (f x)',
            'ISZERO = :n.n (:x.FALSE) TRUE',
            'IF = :p a b.p a b',
            'IF (ISZERO 0) 1 2'
        ].join('\n')
    },
    {
        name: 'Factorial',
        description: 'Y combinator factorial — FACT 2 = 2 (many reduction steps!)',
        expression: [
            'TRUE = :x y.x',
            'FALSE = :x y.y',
            '0 = :f x.x',
            '1 = :f x.f x',
            '2 = :f x.f (f x)',
            'IF = :p a b.p a b',
            'ISZERO = :n.n (:x.FALSE) TRUE',
            'MULT = :m n f.m (n f)',
            'PRED = :n f x.n (:g h.h (g f)) (:u.x) (:u.u)',
            'Y = :f.(:x.f (x x)) (:x.f (x x))',
            'FACT = Y (:f n.IF (ISZERO n) 1 (MULT n (f (PRED n))))',
            'FACT 2'
        ].join('\n')
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
        item.textContent = example.name;
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

