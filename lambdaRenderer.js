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
const ANIM_SHRINK_SCALE = 0.15;   // scale factor for argument mini-tree
const ANIM_COPY_DURATION = 800;   // ms for copies to travel along ropes
const NODE_RADII = { [VARIABLE]: 6, [LAMBDA]: 8, [APPLICATION]: 4 };

// Active macro definitions for labeling nodes { name, ast }
let activeMacros = [];

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
 * Linear interpolation between a and b by parameter t
 */
function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Flatten a tree into an array via pre-order traversal.
 * Used to match argument nodes to copy nodes by structural position.
 */
function flattenTree(node) {
    const result = [node];
    if (node.type === LAMBDA && node.expression) {
        result.push(...flattenTree(node.expression));
    } else if (node.type === APPLICATION) {
        if (node.left) result.push(...flattenTree(node.left));
        if (node.right) result.push(...flattenTree(node.right));
    }
    return result;
}

/**
 * Collect parent→child edge index pairs from a flattened tree array.
 */
function collectTreeEdgeIndices(flatNodes) {
    const indexMap = new Map();
    flatNodes.forEach((n, i) => indexMap.set(n, i));
    const edges = [];
    flatNodes.forEach((n, parentIdx) => {
        if (n.type === LAMBDA && n.expression) {
            edges.push({ srcIdx: parentIdx, tgtIdx: indexMap.get(n.expression) });
        } else if (n.type === APPLICATION) {
            if (n.left) edges.push({ srcIdx: parentIdx, tgtIdx: indexMap.get(n.left) });
            if (n.right) edges.push({ srcIdx: parentIdx, tgtIdx: indexMap.get(n.right) });
        }
    });
    return edges;
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
    activeMacros = [];
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
    svgGroup.append('g').attr('class', 'labels-layer');
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

    // Animate back edges (skip rope paths which lack D3 data bindings)
    svgGroup.select('.back-edges-layer').selectAll('path:not(.rope)')
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
 * Phase 1: Collapse — blue redex nodes shrink-fade away, green argument
 *          shrinks to a mini-tree at the collapse origin, surviving body
 *          nodes slide directly to their final positions. Rope curves
 *          from the lambda to its bound variables are preserved.
 * Phase 2: Copy travel — N miniature copies of the argument travel along
 *          the rope curves from the collapse origin to each bound variable's
 *          final position, scaling up to full size. Ropes shorten as
 *          the copies move, disappearing when they arrive.
 */
function update() {
    if (!data) return;

    // Save state for undo
    previousData.push(deepCopy(data));

    // Perform substitution but don't collapse the redex yet
    const reduction = findAndReduce(data, {});

    if (!reduction) {
        previousData.pop();
        return;
    }

    // --- Save pre-reduction info ---

    const argument = reduction.applicationNode.right;
    const argCopy = deepCopy(argument);
    const argRootPos = previousPositions.get(argument.uid)
        || { x: width / 2, y: height / 2 };
    const lambdaUid = reduction.applicationNode.left.uid;

    // Flatten argument subtree and compute relative positions
    const argFlatNodes = flattenTree(argCopy);
    const argEdgeIndices = collectTreeEdgeIndices(argFlatNodes);
    const argRelPositions = argFlatNodes.map(n => {
        const pos = previousPositions.get(n.uid);
        return pos
            ? { relX: pos.x - argRootPos.x, relY: pos.y - argRootPos.y }
            : { relX: 0, relY: 0 };
    });

    // --- Perform reduction ---

    const uidBefore = nextUid;
    assignUids(data);
    const hasNewNodes = nextUid !== uidBefore;
    assignColors(data);

    disableReduceButtons();

    // Clear macro labels during animation
    svgGroup.select('.labels-layer').selectAll('*').remove();

    // Identify redex and argument UIDs
    const redexUids = new Set([
        reduction.applicationNode.uid,
        reduction.applicationNode.left.uid
    ]);
    const argUids = new Set();
    collectUids(reduction.applicationNode.right, argUids);

    // Find copy roots (mutated bound variables → substituted copy roots)
    const copyRoots = [];
    function findCopyRoots(node) {
        if (node.replacedUid !== undefined) copyRoots.push(node);
        if (node.type === LAMBDA && node.expression) findCopyRoots(node.expression);
        if (node.type === APPLICATION) {
            if (node.left) findCopyRoots(node.left);
            if (node.right) findCopyRoots(node.right);
        }
    }
    findCopyRoots(reduction.reducedExpression);

    // Highlight the redex on the current SVG
    highlightRedex(redexUids, argUids);

    // --- Collapse ---

    const bodyRootUid = reduction.reducedExpression.uid;
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

    // Compute final back-edges to find connecting edges (copy → existing tree)
    const finalBackEdges = computeBackEdges(finalRoot, {});

    // Map each copy node UID to its copy root UID and flat index
    const copyNodeInfo = new Map();
    for (const cr of copyRoots) {
        const flat = flattenTree(cr);
        flat.forEach((n, i) => {
            copyNodeInfo.set(n.uid, { copyRootUid: cr.uid, flatIndex: i });
        });
    }

    // Back-edges from copy variables to existing lambdas
    const connectingEdges = [];
    for (const edge of finalBackEdges) {
        const srcUid = edge.source.data.uid;
        const tgtUid = edge.target.data.uid;
        const srcInfo = copyNodeInfo.get(srcUid);
        if (srcInfo && !copyNodeInfo.has(tgtUid)) {
            const tgtPos = finalPositions.get(tgtUid);
            if (tgtPos) {
                connectingEdges.push({
                    copyRootUid: srcInfo.copyRootUid,
                    nodeIndex: srcInfo.flatIndex,
                    targetPos: tgtPos,
                    color: edge.source.data.color || '#a5b4fc'
                });
            }
        }
    }

    // --- Phase 1: Animated collapse with argument mini-tree ---

    const bezierLine = d3.line().curve(d3.curveCatmullRom.alpha(0.5));
    const greenGlow = 'drop-shadow(0 0 6px #22c55e) drop-shadow(0 0 10px #22c55e)';

    // 1. Extract argument elements from SVG → build overlay group
    svgGroup.select('.nodes-layer').selectAll('circle')
        .filter(d => argUids.has(d.data.uid))
        .remove();

    svgGroup.select('.tree-edges-layer').selectAll('line')
        .filter(d => argUids.has(d.source.data.uid) && argUids.has(d.target.data.uid))
        .remove();

    const argBackEdgeInfo = [];
    svgGroup.select('.back-edges-layer').selectAll('path')
        .filter(function(d) {
            if (argUids.has(d.source.data.uid) && argUids.has(d.target.data.uid)) {
                argBackEdgeInfo.push({
                    srcRelX: d.source.x - argRootPos.x,
                    srcRelY: d.source.y - argRootPos.y,
                    tgtRelX: d.target.x - argRootPos.x,
                    tgtRelY: d.target.y - argRootPos.y,
                    color: d3.select(this).style('stroke')
                });
                return true;
            }
            return false;
        })
        .remove();

    // 2. Extract lambda→bound-variable back-edges, replace with controlled ropes
    const ropeData = [];
    svgGroup.select('.back-edges-layer').selectAll('path')
        .filter(function(d) {
            if (d.target.data.uid === lambdaUid) {
                const copyRootUid = d.source.data.uid;
                const targetFinalPos = finalPositions.get(copyRootUid);
                if (targetFinalPos) {
                    ropeData.push({
                        sourceStartPos: { x: d.source.x, y: d.source.y },
                        lambdaStartPos: { x: d.target.x, y: d.target.y },
                        color: d3.select(this).style('stroke'),
                        copyRootUid,
                        targetFinalPos
                    });
                }
                return true;
            }
            return false;
        })
        .remove();

    const ropes = ropeData.map(r => {
        const rope = svgGroup.select('.back-edges-layer').append('path')
            .attr('class', 'back-edge rope')
            .style('stroke', r.color)
            .style('opacity', 0.6)
            .attr('d', backEdgePathFromCoords(
                r.lambdaStartPos.x, r.lambdaStartPos.y,
                r.sourceStartPos.x, r.sourceStartPos.y, bezierLine));
        rope.transition().duration(ANIM_MOVE_DURATION)
            .attr('d', backEdgePathFromCoords(
                shrinkTarget.x, shrinkTarget.y,
                r.targetFinalPos.x, r.targetFinalPos.y, bezierLine));
        return { rope, copyRootUid: r.copyRootUid, targetFinalPos: r.targetFinalPos, color: r.color };
    });

    // 3. Create argument overlay group (shrinks to mini-tree at shrinkTarget)
    const argOverlay = svgGroup.append('g')
        .attr('class', 'arg-overlay')
        .attr('transform', `translate(${argRootPos.x},${argRootPos.y})`);

    argBackEdgeInfo.forEach(be => {
        argOverlay.append('path')
            .attr('class', 'back-edge')
            .style('stroke', be.color)
            .style('opacity', 0.6)
            .attr('d', backEdgePathFromCoords(
                be.srcRelX, be.srcRelY,
                be.tgtRelX, be.tgtRelY, bezierLine))
            .style('filter', greenGlow);
    });

    argEdgeIndices.forEach(e => {
        argOverlay.append('line')
            .attr('x1', argRelPositions[e.srcIdx].relX)
            .attr('y1', argRelPositions[e.srcIdx].relY)
            .attr('x2', argRelPositions[e.tgtIdx].relX)
            .attr('y2', argRelPositions[e.tgtIdx].relY)
            .style('filter', greenGlow);
    });

    argFlatNodes.forEach((n, i) => {
        const circle = argOverlay.append('circle')
            .attr('cx', argRelPositions[i].relX)
            .attr('cy', argRelPositions[i].relY)
            .attr('r', NODE_RADII[n.type] || 6);
        applyNodeStyle(circle, { type: n.type, color: n.color });
        circle.style('filter', greenGlow);
    });

    argOverlay.transition().duration(ANIM_MOVE_DURATION)
        .attr('transform',
            `translate(${shrinkTarget.x},${shrinkTarget.y}) scale(${ANIM_SHRINK_SCALE})`);

    // 4. Run animateCollapse on remaining SVG elements
    animateCollapse(shrinkTarget, finalPositions);

    // --- Phase 2: Copy travel along ropes ---

    setTimeout(() => {
        svgGroup.selectAll('.arg-overlay').remove();

        if (copyRoots.length === 0 || ropes.length === 0) {
            // No copies to animate — just clean up and redraw
            ropes.forEach(r => r.rope.remove());
            previousPositions = finalPositions;
            drawTree(data);
            updateCurrentExpression();
            enableReduceButtons();
            return;
        }

        const copyTravelData = [];

        for (const copyRoot of copyRoots) {
            const rope = ropes.find(r => r.copyRootUid === copyRoot.uid);
            if (!rope) continue;

            const targetPos = rope.targetFinalPos;
            const copyFlatNodes = flattenTree(copyRoot);

            // Per-node start/end offsets (relative to root) and radii
            const nodeData = copyFlatNodes.map((cn, i) => {
                const argRel = argRelPositions[i] || { relX: 0, relY: 0 };
                const startOffsetX = argRel.relX * ANIM_SHRINK_SCALE;
                const startOffsetY = argRel.relY * ANIM_SHRINK_SCALE;

                const fp = finalPositions.get(cn.uid);
                const endOffsetX = fp ? fp.x - targetPos.x : 0;
                const endOffsetY = fp ? fp.y - targetPos.y : 0;

                const endR = NODE_RADII[cn.type] || 6;
                const startR = endR * ANIM_SHRINK_SCALE;

                return {
                    node: cn, argNode: argFlatNodes[i],
                    startOffsetX, startOffsetY,
                    endOffsetX, endOffsetY,
                    startR, endR,
                    circle: null
                };
            });

            const edgeData = argEdgeIndices.map(e => ({
                srcIdx: e.srcIdx, tgtIdx: e.tgtIdx, line: null
            }));

            // Create SVG elements for this traveling copy
            const copyGroup = svgGroup.append('g').attr('class', 'copy-travel');

            edgeData.forEach(e => {
                e.line = copyGroup.append('line')
                    .attr('x1', shrinkTarget.x + nodeData[e.srcIdx].startOffsetX)
                    .attr('y1', shrinkTarget.y + nodeData[e.srcIdx].startOffsetY)
                    .attr('x2', shrinkTarget.x + nodeData[e.tgtIdx].startOffsetX)
                    .attr('y2', shrinkTarget.y + nodeData[e.tgtIdx].startOffsetY);
            });

            nodeData.forEach(nd => {
                nd.circle = copyGroup.append('circle')
                    .attr('cx', shrinkTarget.x + nd.startOffsetX)
                    .attr('cy', shrinkTarget.y + nd.startOffsetY)
                    .attr('r', nd.startR);
                applyNodeStyle(nd.circle, { type: nd.node.type, color: nd.node.color });
            });

            // Create connecting back-edges (copy variable → existing lambda)
            const connEdges = connectingEdges
                .filter(ce => ce.copyRootUid === copyRoot.uid)
                .map(ce => {
                    const nd = nodeData[ce.nodeIndex];
                    const srcX = shrinkTarget.x + nd.startOffsetX;
                    const srcY = shrinkTarget.y + nd.startOffsetY;
                    const path = copyGroup.append('path')
                        .attr('class', 'back-edge')
                        .style('stroke', ce.color)
                        .style('opacity', 0.6)
                        .attr('d', backEdgePathFromCoords(
                            srcX, srcY,
                            ce.targetPos.x, ce.targetPos.y, bezierLine));
                    return { path, nodeIndex: ce.nodeIndex, targetPos: ce.targetPos };
                });

            // Hidden path for sampling positions along the rope curve
            const samplePathStr = backEdgePathFromCoords(
                shrinkTarget.x, shrinkTarget.y,
                targetPos.x, targetPos.y, bezierLine);
            const samplePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            samplePath.setAttribute('d', samplePathStr);
            samplePath.style.visibility = 'hidden';
            svgGroup.node().appendChild(samplePath);

            copyTravelData.push({
                copyGroup, rope: rope.rope, targetPos,
                nodeData, edgeData, connEdges, samplePath
            });
        }

        if (copyTravelData.length === 0) {
            ropes.forEach(r => r.rope.remove());
            previousPositions = finalPositions;
            drawTree(data);
            updateCurrentExpression();
            enableReduceButtons();
            return;
        }

        // Animate all copies traveling along their ropes
        const timer = d3.timer(elapsed => {
            const t = Math.min(elapsed / ANIM_COPY_DURATION, 1);
            const ease = d3.easeCubicInOut(t);

            for (const copy of copyTravelData) {
                // Root follows the rope curve
                const pathLen = copy.samplePath.getTotalLength();
                const pt = copy.samplePath.getPointAtLength(ease * pathLen);
                const rootX = pt.x;
                const rootY = pt.y;

                // Shorten the rope (source end follows copy root)
                copy.rope.attr('d', backEdgePathFromCoords(
                    rootX, rootY,
                    copy.targetPos.x, copy.targetPos.y, bezierLine));

                // Update node positions and radii
                for (const nd of copy.nodeData) {
                    const ox = lerp(nd.startOffsetX, nd.endOffsetX, ease);
                    const oy = lerp(nd.startOffsetY, nd.endOffsetY, ease);
                    const r = lerp(nd.startR, nd.endR, ease);
                    nd.circle
                        .attr('cx', rootX + ox)
                        .attr('cy', rootY + oy)
                        .attr('r', r);
                }

                // Update tree edge positions
                for (const e of copy.edgeData) {
                    const sNd = copy.nodeData[e.srcIdx];
                    const tNd = copy.nodeData[e.tgtIdx];
                    e.line
                        .attr('x1', rootX + lerp(sNd.startOffsetX, sNd.endOffsetX, ease))
                        .attr('y1', rootY + lerp(sNd.startOffsetY, sNd.endOffsetY, ease))
                        .attr('x2', rootX + lerp(tNd.startOffsetX, tNd.endOffsetX, ease))
                        .attr('y2', rootY + lerp(tNd.startOffsetY, tNd.endOffsetY, ease));
                }

                // Update connecting back-edges (copy variable → existing lambda)
                for (const ce of copy.connEdges) {
                    const nd = copy.nodeData[ce.nodeIndex];
                    const srcX = rootX + lerp(nd.startOffsetX, nd.endOffsetX, ease);
                    const srcY = rootY + lerp(nd.startOffsetY, nd.endOffsetY, ease);
                    ce.path.attr('d', backEdgePathFromCoords(
                        srcX, srcY,
                        ce.targetPos.x, ce.targetPos.y, bezierLine));
                }
            }

            if (t >= 1) {
                timer.stop();
                for (const copy of copyTravelData) {
                    copy.copyGroup.remove();
                    copy.samplePath.remove();
                }
                ropes.forEach(r => r.rope.remove());

                previousPositions = finalPositions;
                drawTree(data);
                updateCurrentExpression();
                enableReduceButtons();
            }
        });
    }, ANIM_MOVE_DURATION);
}

/**
 * Update tooltips on all nodes to show the sub-expression string on hover
 */
function updateTooltips() {
    let tooltip = document.getElementById('node-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'node-tooltip';
        document.getElementById('tree-container').appendChild(tooltip);
    }

    const nodeLayer = svgGroup.select('.nodes-layer');
    nodeLayer.selectAll('circle').select('title').remove();
    nodeLayer.selectAll('circle')
        .on('mouseenter', function(event, d) {
            tooltip.textContent = expressionToString(d.data);
            tooltip.style.display = 'block';
            const rect = document.getElementById('tree-container').getBoundingClientRect();
            tooltip.style.left = (event.clientX - rect.left + 12) + 'px';
            tooltip.style.top = (event.clientY - rect.top - 28) + 'px';
        })
        .on('mousemove', function(event) {
            const rect = document.getElementById('tree-container').getBoundingClientRect();
            tooltip.style.left = (event.clientX - rect.left + 12) + 'px';
            tooltip.style.top = (event.clientY - rect.top - 28) + 'px';
        })
        .on('mouseleave', function() {
            tooltip.style.display = 'none';
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

    // Parse macro bodies into ASTs for label matching
    activeMacros = [];
    for (const m of lastExpandedMacros) {
        try {
            const ast = parseExpression([m.body]);
            activeMacros.push({ name: m.name, ast });
        } catch (e) {
            // skip unparseable macros
        }
    }

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
 * Find the first macro whose AST is alpha-equivalent to this node.
 */
function findMacroLabel(node) {
    for (const macro of activeMacros) {
        if (alphaEquivalent(node, macro.ast)) {
            return macro.name;
        }
    }
    return null;
}

/**
 * Annotate every node in the tree with a macroLabel property.
 */
function annotateMacroLabels(node) {
    node.macroLabel = findMacroLabel(node);
    if (node.type === LAMBDA && node.expression) {
        annotateMacroLabels(node.expression);
    } else if (node.type === APPLICATION) {
        if (node.left) annotateMacroLabels(node.left);
        if (node.right) annotateMacroLabels(node.right);
    }
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

    // Annotate macro labels
    if (activeMacros.length > 0) {
        annotateMacroLabels(treeData);
    }

    // Clear existing elements
    svgGroup.select('.tree-edges-layer').selectAll('*').remove();
    svgGroup.select('.back-edges-layer').selectAll('*').remove();
    svgGroup.select('.nodes-layer').selectAll('*').remove();
    svgGroup.select('.labels-layer').selectAll('*').remove();

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

    // Draw macro labels
    if (activeMacros.length > 0) {
        const labelLayer = svgGroup.select('.labels-layer');
        const labelData = nodes.filter(d => d.data.macroLabel);
        labelLayer.selectAll('text')
            .data(labelData)
            .enter()
            .append('text')
            .attr('class', 'macro-label')
            .attr('x', d => d.x)
            .attr('y', d => d.y - (NODE_RADII[d.data.type] || 6) - 6)
            .text(d => d.data.macroLabel);
    }

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
