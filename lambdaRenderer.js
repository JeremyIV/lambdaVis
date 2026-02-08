/**
 * Lambda Calculus Tree Renderer
 * Uses D3.js for visualization
 */

// State
let previousData = [];
let data = null;
let nextUid = 1;
let svg = null;
let svgGroup = null;
let previousPositions = new Map();  // uid → {x, y}

// Dimensions (updated on resize)
let width = 800;
let height = 600;
const padding = 40;
const ANIM_MOVE_DURATION = 800;   // ms for nodes/edges to move
const ANIM_FADE_DURATION = 600;   // ms for removed nodes to fade out

// Color scale for lambda-variable relationships
const lambdaColors = [
    '#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626',
    '#7c3aed', '#db2777', '#2563eb', '#65a30d', '#ea580c',
    '#0d9488', '#c026d3', '#0284c7', '#ca8a04', '#e11d48'
];
let globalColorIndex = 0;

function getNextColor() {
    const color = lambdaColors[globalColorIndex % lambdaColors.length];
    globalColorIndex++;
    return color;
}

/**
 * Initialize the visualizer
 */
function initialize() {
    updateDimensions();
    createSvg();
    
    window.addEventListener('resize', debounce(handleResize, 150));
    
    populateExamples();
    updateBackButton();
    
    // Load default expression
    nextUid = 1;
    globalColorIndex = 0;
    previousPositions = new Map();
    const defaultExpr = '(:x y.x)(:x y.y)';
    document.getElementById('lambdaString').value = defaultExpr;
    
    const consumableString = [defaultExpr];
    try {
        data = parseExpression(consumableString);
        assignUids(data);
        assignColors(data);
        drawTree(data);
        updateCurrentExpression();
    } catch (e) {
        console.error('Failed to parse default expression:', e);
    }
}

/**
 * Create the persistent SVG element
 */
function createSvg() {
    d3.select('#tree-container').selectAll('svg').remove();
    
    const container = document.getElementById('tree-container');
    svg = d3.select('#tree-container')
        .append('svg')
        .attr('width', container.clientWidth)
        .attr('height', container.clientHeight);
    
    svgGroup = svg.append('g')
        .attr('transform', `translate(${padding}, ${padding})`);
    
    // Create layer groups for proper z-ordering
    svgGroup.append('g').attr('class', 'back-edges-layer');
    svgGroup.append('g').attr('class', 'tree-edges-layer');
    svgGroup.append('g').attr('class', 'nodes-layer');
}

/**
 * Update dimensions based on container size
 */
function updateDimensions() {
    const container = document.getElementById('tree-container');
    if (container) {
        width = container.clientWidth - padding * 2;
        height = container.clientHeight - padding * 2;
        width = Math.max(width, 200);
        height = Math.max(height, 200);
    }
}

/**
 * Handle window resize
 */
function handleResize() {
    updateDimensions();
    const container = document.getElementById('tree-container');
    if (svg && container) {
        svg.attr('width', container.clientWidth)
           .attr('height', container.clientHeight);
    }
    if (data) {
        drawTree(data);
    }
}

/**
 * Simple debounce function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Update the back button disabled state
 */
function updateBackButton() {
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.disabled = previousData.length === 0;
    }
}

/**
 * Update the current expression display
 */
function updateCurrentExpression() {
    const exprElement = document.getElementById('current-expr');
    if (exprElement && data) {
        try {
            exprElement.textContent = expressionToString(data);
        } catch (e) {
            exprElement.textContent = '(error)';
        }
    }
}

/**
 * Assign unique IDs to all nodes in the expression tree
 */
function assignUids(node) {
    if (!node.uid) {
        node.uid = nextUid++;
    }
    if (node.type === LAMBDA && node.expression) {
        assignUids(node.expression);
    } else if (node.type === APPLICATION) {
        if (node.left) assignUids(node.left);
        if (node.right) assignUids(node.right);
    }
}

/**
 * Collect all UIDs from a subtree into a Set
 */
function collectUids(node, uidSet) {
    if (!node) return;
    if (node.uid) uidSet.add(node.uid);
    if (node.type === LAMBDA && node.expression) {
        collectUids(node.expression, uidSet);
    } else if (node.type === APPLICATION) {
        if (node.left) collectUids(node.left, uidSet);
        if (node.right) collectUids(node.right, uidSet);
    }
}

/**
 * Apply glow highlights to the redex (blue) and argument (green) nodes and edges
 */
function highlightRedex(redexUids, argUids) {
    const blueGlow = 'drop-shadow(0 0 6px #3b82f6) drop-shadow(0 0 10px #3b82f6)';
    const greenGlow = 'drop-shadow(0 0 6px #22c55e) drop-shadow(0 0 10px #22c55e)';

    // Helper: pick glow for an element based on its UIDs
    function glowFor(uids) {
        const hasRedex = uids.some(u => redexUids.has(u));
        const hasArg = uids.some(u => argUids.has(u));
        if (hasRedex) return blueGlow;
        if (hasArg) return greenGlow;
        return null;
    }

    // Nodes
    svgGroup.select('.nodes-layer').selectAll('circle')
        .each(function(d) {
            const glow = glowFor([d.data.uid]);
            if (glow) d3.select(this).style('filter', glow);
        });

    // Tree edges
    svgGroup.select('.tree-edges-layer').selectAll('line')
        .each(function(d) {
            const glow = glowFor([d.source.data.uid, d.target.data.uid]);
            if (glow) d3.select(this).style('filter', glow);
        });

    // Back edges
    svgGroup.select('.back-edges-layer').selectAll('path')
        .each(function(d) {
            const glow = glowFor([d.source.data.uid, d.target.data.uid]);
            if (glow) d3.select(this).style('filter', glow);
        });
}

/**
 * Animate the collapse from intermediate state to final state.
 * Surviving nodes slide to final positions; redex nodes shrink-fade
 * towards the shrink target (the body's final position).
 */
function animateCollapse(shrinkTarget, finalPositions) {
    const duration = ANIM_MOVE_DURATION;
    const bezierLine = d3.line().curve(d3.curveCatmullRom.alpha(0.5));

    // Animate nodes
    svgGroup.select('.nodes-layer').selectAll('circle')
        .each(function(d) {
            const el = d3.select(this);
            const finalPos = finalPositions.get(d.data.uid);
            if (finalPos) {
                // Surviving node: slide to final position
                el.transition().duration(duration)
                    .attr('cx', finalPos.x)
                    .attr('cy', finalPos.y);
            } else {
                // Redex node: shrink-fade towards target
                el.transition().duration(duration)
                    .attr('cx', shrinkTarget.x)
                    .attr('cy', shrinkTarget.y)
                    .attr('r', 0)
                    .style('opacity', 0);
            }
        });

    // Animate tree edges
    svgGroup.select('.tree-edges-layer').selectAll('line')
        .each(function(d) {
            const el = d3.select(this);
            const srcFinal = finalPositions.get(d.source.data.uid);
            const tgtFinal = finalPositions.get(d.target.data.uid);
            if (srcFinal && tgtFinal) {
                // Both survive: transition
                el.transition().duration(duration)
                    .attr('x1', srcFinal.x).attr('y1', srcFinal.y)
                    .attr('x2', tgtFinal.x).attr('y2', tgtFinal.y);
            } else {
                // At least one redex endpoint: collapse towards target and fade
                el.transition().duration(duration)
                    .attr('x1', srcFinal ? srcFinal.x : shrinkTarget.x)
                    .attr('y1', srcFinal ? srcFinal.y : shrinkTarget.y)
                    .attr('x2', tgtFinal ? tgtFinal.x : shrinkTarget.x)
                    .attr('y2', tgtFinal ? tgtFinal.y : shrinkTarget.y)
                    .style('opacity', 0);
            }
        });

    // Animate back edges
    svgGroup.select('.back-edges-layer').selectAll('path')
        .each(function(d) {
            const el = d3.select(this);
            const srcFinal = finalPositions.get(d.source.data.uid);
            const tgtFinal = finalPositions.get(d.target.data.uid);
            if (srcFinal && tgtFinal) {
                // Both survive: transition path
                el.transition().duration(duration)
                    .attr('d', backEdgePathFromCoords(
                        srcFinal.x, srcFinal.y,
                        tgtFinal.x, tgtFinal.y, bezierLine));
            } else {
                // At least one redex endpoint: shrink towards target and fade
                const sx = srcFinal ? srcFinal.x : shrinkTarget.x;
                const sy = srcFinal ? srcFinal.y : shrinkTarget.y;
                const tx = tgtFinal ? tgtFinal.x : shrinkTarget.x;
                const ty = tgtFinal ? tgtFinal.y : shrinkTarget.y;
                el.transition().duration(duration)
                    .attr('d', backEdgePathFromCoords(sx, sy, tx, ty, bezierLine))
                    .style('opacity', 0);
            }
        });
}

/**
 * Assign colors to lambdas and propagate to bound variables.
 * Preserves existing colors on lambdas, only assigns to new ones.
 */
function assignColors(node, scope = {}) {
    if (node.type === LAMBDA) {
        // Only assign a new color if this lambda doesn't have one
        if (!node.color) {
            node.color = getNextColor();
        }
        const newScope = { ...scope, [node.id]: node.color };
        assignColors(node.expression, newScope);
    } else if (node.type === APPLICATION) {
        assignColors(node.left, scope);
        assignColors(node.right, scope);
    } else if (node.type === VARIABLE) {
        // Variables always get colored based on their binding lambda
        node.color = scope[node.id] || '#9ca3af';
    }
}

/**
 * Disable the reduce and back buttons during animation
 */
function disableReduceButtons() {
    const reduceBtn = document.getElementById('reduce-btn');
    const backBtn = document.getElementById('back-btn');
    if (reduceBtn) reduceBtn.disabled = true;
    if (backBtn) backBtn.disabled = true;
}

/**
 * Re-enable the reduce and back buttons after animation
 */
function enableReduceButtons() {
    const reduceBtn = document.getElementById('reduce-btn');
    if (reduceBtn) reduceBtn.disabled = false;
    updateBackButton();
}

/**
 * Perform one beta reduction step with animation.
 * Phase 1: Collapse — redex nodes shrink-fade away while surviving nodes
 *          slide directly to their final positions.
 * Phase 2: Substitution — newly created copies fade in at their final positions.
 */
function update() {
    if (!data) return;

    // Save state for undo
    previousData.push(deepCopy(data));

    // Perform substitution but don't collapse the redex yet
    const reduction = findAndReduce(data, {});

    if (!reduction) {
        // No reduction happened, remove the saved state
        previousData.pop();
        return;
    }

    // Assign UIDs and colors to new nodes (substituted copies)
    const uidBefore = nextUid;
    assignUids(data);
    const hasNewNodes = nextUid !== uidBefore;
    assignColors(data);

    disableReduceButtons();

    // Identify redex (blue glow) and argument (green glow) nodes
    const redexUids = new Set([
        reduction.applicationNode.uid,
        reduction.applicationNode.left.uid
    ]);
    const argUids = new Set();
    collectUids(reduction.applicationNode.right, argUids);

    // Highlight the redex on the current SVG
    highlightRedex(redexUids, argUids);

    // Save the body root uid — this is the shrink-fade target
    const bodyRootUid = reduction.reducedExpression.uid;

    // Collapse the redex — data is now the final tree
    copyInto(reduction.applicationNode, reduction.reducedExpression);
    assignUids(data);
    assignColors(data);

    // Compute final layout
    const finalRoot = d3.hierarchy(data, getChildren);
    const treeLayout = d3.tree()
        .size([width, height])
        .separation((a, b) => (a.parent === b.parent ? 1 : 1.5));
    treeLayout(finalRoot);

    const finalPositions = new Map();
    finalRoot.descendants().forEach(d => {
        finalPositions.set(d.data.uid, { x: d.x, y: d.y });
    });

    const shrinkTarget = finalPositions.get(bodyRootUid)
        || { x: width / 2, y: height / 2 };

    // Phase 1: Shrink-fade redex nodes, move surviving nodes to final positions
    animateCollapse(shrinkTarget, finalPositions);

    // Phase 2: After collapse completes, fade in new substituted copies
    setTimeout(() => {
        // Collect UIDs currently visible in the SVG — these are nodes that
        // existed before the reduction (some mutated from bound variables
        // into substituted copy roots, sliding to their new positions).
        const visibleUids = new Set();
        svgGroup.select('.nodes-layer').selectAll('circle')
            .each(function(d) {
                if (d.data.uid !== undefined) visibleUids.add(d.data.uid);
            });

        // Only include visible UIDs in previousPositions so that drawTree
        // treats genuinely new nodes (copy subtree children) as new.
        const phase2Positions = new Map();
        finalPositions.forEach((pos, uid) => {
            if (visibleUids.has(uid)) {
                phase2Positions.set(uid, pos);
            }
        });
        previousPositions = phase2Positions;

        // Redraw: existing nodes snap to position, new nodes fade in
        drawTree(data, hasNewNodes, 0);
        updateCurrentExpression();

        // Re-enable buttons after fade-in completes
        setTimeout(enableReduceButtons, hasNewNodes ? ANIM_FADE_DURATION : 0);
    }, ANIM_MOVE_DURATION);
}

/**
 * Update tooltips on all nodes
 */
function updateTooltips() {
    const nodeLayer = svgGroup.select('.nodes-layer');
    nodeLayer.selectAll('circle').select('title').remove();
    nodeLayer.selectAll('circle')
        .append('title')
        .text(d => {
            if (d.data.type === LAMBDA) return `λ${d.data.id}`;
            if (d.data.type === VARIABLE) return d.data.id;
            return '@';
        });
}

/**
 * Apply visual styles to a node based on its type
 */
function applyNodeStyle(node, data) {
    node.attr('class', `node ${data.type}`);
    if (data.type === LAMBDA) {
        node.style('fill', data.color)
            .style('stroke', data.color);
    } else if (data.type === VARIABLE) {
        node.style('stroke', data.color);
    } else {
        node.style('fill', null)
            .style('stroke', null);
    }
}

/**
 * Go back to previous state
 */
function goBack() {
    if (previousData.length === 0) return;
    
    data = previousData.pop();
    assignColors(data);
    drawTree(data);
    updateCurrentExpression();
    updateBackButton();
}

/**
 * Parse input and load new expression
 */
function parseAndLoad() {
    nextUid = 1;
    globalColorIndex = 0; // Reset colors for new expression
    previousData = [];
    previousPositions = new Map();
    
    const input = document.getElementById('lambdaString');
    const rawInput = input ? input.value.trim() : '';

    if (!rawInput) {
        alert('Please enter a lambda expression');
        return;
    }

    const lambdaString = expandMacros(rawInput);
    const consumableString = [lambdaString];
    
    try {
        data = parseExpression(consumableString);
        const remainingUnparsed = consumableString[0].trim();
        
        if (remainingUnparsed !== '') {
            console.warn('Remaining unparsed chars:', remainingUnparsed);
        }
        
        assignUids(data);
        assignColors(data);
        drawTree(data);
        updateCurrentExpression();
        updateBackButton();
    } catch (e) {
        console.error('Parse error:', e);
        alert('Failed to parse expression: ' + e.message);
    }
}

/**
 * Get children of a node for D3 hierarchy
 */
function getChildren(node) {
    if (node.type === VARIABLE) {
        return [];
    }
    if (node.type === LAMBDA) {
        return [node.expression];
    }
    if (node.type === APPLICATION) {
        return [node.left, node.right];
    }
    return [];
}

/**
 * Draw the expression tree
 * @param {Object} treeData - The expression tree to render
 * @param {boolean} animate - If true, animate nodes from previous positions
 */
function drawTree(treeData, animate = false, fadeDelay = ANIM_MOVE_DURATION) {
    if (!svgGroup) {
        createSvg();
    }

    // Clear existing elements
    svgGroup.select('.tree-edges-layer').selectAll('*').remove();
    svgGroup.select('.back-edges-layer').selectAll('*').remove();
    svgGroup.select('.nodes-layer').selectAll('*').remove();

    // Create hierarchy
    const root = d3.hierarchy(treeData, getChildren);
    const treeLayout = d3.tree()
        .size([width, height])
        .separation((a, b) => (a.parent === b.parent ? 1 : 1.5));
    treeLayout(root);

    const nodes = root.descendants();
    const links = root.links();
    const backEdges = computeBackEdges(root, {});

    // Helper: determine starting position for a node
    function startPos(d) {
        if (!animate) {
            return { x: d.x, y: d.y };
        }
        const prev = previousPositions.get(d.data.uid);
        if (prev) {
            return { x: prev.x, y: prev.y };
        }
        // Root of a substituted copy — start from the old bound variable's position
        if (d.data.replacedUid !== undefined) {
            const replaced = previousPositions.get(d.data.replacedUid);
            if (replaced) {
                return { x: replaced.x, y: replaced.y };
            }
        }
        // New node — place at final position (will fade in)
        return { x: d.x, y: d.y };
    }

    // Helper: is this a node with no previous position?
    function isNewNode(d) {
        if (previousPositions.has(d.data.uid)) return false;
        if (d.data.replacedUid !== undefined && previousPositions.has(d.data.replacedUid)) return false;
        return true;
    }

    // Draw tree edges
    const treeEdgeLayer = svgGroup.select('.tree-edges-layer');
    const edgeSelection = treeEdgeLayer.selectAll('line')
        .data(links)
        .enter()
        .append('line')
        .attr('x1', d => startPos(d.source).x)
        .attr('y1', d => startPos(d.source).y)
        .attr('x2', d => startPos(d.target).x)
        .attr('y2', d => startPos(d.target).y);

    if (animate) {
        // Existing edges: transition position
        edgeSelection.filter(d => !isNewNode(d.source) && !isNewNode(d.target))
            .transition()
            .duration(ANIM_MOVE_DURATION)
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);

        // Edges touching new nodes: snap to final position, invisible, then fade in
        edgeSelection.filter(d => isNewNode(d.source) || isNewNode(d.target))
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y)
            .style('opacity', 0)
            .transition()
            .delay(fadeDelay)
            .duration(ANIM_FADE_DURATION)
            .style('opacity', 1);
    }

    // Draw back edges
    const backEdgeLayer = svgGroup.select('.back-edges-layer');
    const bezierLine = d3.line().curve(d3.curveCatmullRom.alpha(0.5));

    const backEdgeSelection = backEdgeLayer.selectAll('path')
        .data(backEdges)
        .enter()
        .append('path')
        .attr('class', 'back-edge')
        .style('stroke', d => d.source.data.color || '#a5b4fc');

    if (animate) {
        backEdgeSelection.each(function(d) {
            const el = d3.select(this);
            const srcNew = isNewNode(d.source);
            const tgtNew = isNewNode(d.target);

            if (!srcNew && !tgtNew) {
                // Both endpoints exist: transition path
                const src = startPos(d.source);
                const tgt = startPos(d.target);
                el.attr('d', backEdgePathFromCoords(src.x, src.y, tgt.x, tgt.y, bezierLine))
                  .style('opacity', 0.6)
                  .transition()
                  .duration(ANIM_MOVE_DURATION)
                  .attr('d', computeBackEdgePath(d, bezierLine));
            } else {
                // At least one new endpoint: fade in after move
                el.attr('d', computeBackEdgePath(d, bezierLine))
                  .style('opacity', 0)
                  .transition()
                  .delay(fadeDelay)
                  .duration(ANIM_FADE_DURATION)
                  .style('opacity', 0.6);
            }
        });
    } else {
        backEdgeSelection
            .attr('d', d => computeBackEdgePath(d, bezierLine))
            .style('opacity', 0.6);
    }

    // Draw nodes
    const nodeLayer = svgGroup.select('.nodes-layer');
    const nodeSelection = nodeLayer.selectAll('circle')
        .data(nodes)
        .enter()
        .append('circle')
        .attr('cx', d => startPos(d).x)
        .attr('cy', d => startPos(d).y);

    if (animate) {
        // Existing nodes: slide to new position
        nodeSelection.filter(d => !isNewNode(d))
            .transition()
            .duration(ANIM_MOVE_DURATION)
            .attr('cx', d => d.x)
            .attr('cy', d => d.y);

        // New nodes: invisible, then fade in after move
        nodeSelection.filter(d => isNewNode(d))
            .style('opacity', 0)
            .transition()
            .delay(fadeDelay)
            .duration(ANIM_FADE_DURATION)
            .style('opacity', 1);
    }

    nodeSelection.each(function(d) {
        applyNodeStyle(d3.select(this), d.data);
    });

    // Update tooltips
    updateTooltips();

    // Save positions for next animated draw
    const newPositions = new Map();
    nodes.forEach(d => {
        newPositions.set(d.data.uid, { x: d.x, y: d.y });
    });
    previousPositions = newPositions;
}

/**
 * Compute a back edge path from explicit coordinates
 */
function backEdgePathFromCoords(sx, sy, tx, ty, bezierLine) {
    const warp = 15 + Math.abs(ty - sy) * 0.05;
    return bezierLine([
        [sx, sy],
        [Math.max(sx, tx) + warp, (sy + ty) / 2],
        [tx, ty]
    ]);
}

/**
 * Compute the path for a back edge (variable binding curve)
 */
function computeBackEdgePath(edge, bezierLine) {
    return backEdgePathFromCoords(
        edge.source.x, edge.source.y,
        edge.target.x, edge.target.y,
        bezierLine
    );
}

/**
 * Compute back edges from variables to their binding lambdas
 */
function computeBackEdges(root, scope) {
    const data = root.data;
    const type = data.type;
    
    if (type === VARIABLE) {
        const id = data.id;
        const bindingLambda = scope[id];
        if (bindingLambda === undefined) {
            return [];
        }
        return [{
            source: root,
            target: bindingLambda
        }];
    }
    
    if (type === LAMBDA) {
        const id = data.id;
        const prevBinding = scope[id];
        scope[id] = root;
        const edges = root.children ? computeBackEdges(root.children[0], scope) : [];
        if (prevBinding !== undefined) {
            scope[id] = prevBinding;
        } else {
            delete scope[id];
        }
        return edges;
    }
    
    if (type === APPLICATION) {
        const leftEdges = root.children ? computeBackEdges(root.children[0], scope) : [];
        const rightEdges = root.children && root.children[1] ? computeBackEdges(root.children[1], scope) : [];
        return [...leftEdges, ...rightEdges];
    }
    
    return [];
}
