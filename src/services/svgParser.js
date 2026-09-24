const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  allowBooleanAttributes: true,
});

const toArray = (val) => (Array.isArray(val) ? val : val ? [val] : []);

const getNumber = (val) => {
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
};

const buildGridPositions = (count) => {
  const cols = Math.max(2, Math.ceil(Math.sqrt(count)));
  const gapX = 220;
  const gapY = 160;
  return Array.from({ length: count }, (_, i) => ({
    x: (i % cols) * gapX + 60,
    y: Math.floor(i / cols) * gapY + 60,
  }));
};

const walkSvg = (node, collector, path = []) => {
  if (!node || typeof node !== 'object') return;
  Object.entries(node).forEach(([key, value]) => {
    if (key === '#text') return;
    const nextPath = path.concat(key);
    const nodes = toArray(value);
    nodes.forEach((item) => {
      if (item && typeof item === 'object') {
        const id = item.id || item['data-id'] || item['data-machine'] || null;
        const label = item['data-label'] || item['aria-label'] || id || key;
        const isNode = Boolean(item['data-node']) || Boolean(id);

        if (isNode && id) {
          collector.nodes.push({
            id,
            label,
            raw: item,
            type: key,
            layer: path[path.length - 1] || null,
          });
        }

        const edgeFrom = item['data-from'] || item['data-source'];
        const edgeTo = item['data-to'] || item['data-target'];
        if (edgeFrom && edgeTo) {
          collector.edges.push({
            source: edgeFrom,
            target: edgeTo,
            label: item['data-label'] || null,
          });
        }

        if (key === 'g' && item.id) {
          collector.layers.add(item.id);
        }

        walkSvg(item, collector, nextPath);
      }
    });
  });
};

const extractPositions = (rawNode) => {
  if (!rawNode || typeof rawNode !== 'object') return null;
  const x = getNumber(rawNode.x) ?? getNumber(rawNode.cx) ?? getNumber(rawNode['data-x']);
  const y = getNumber(rawNode.y) ?? getNumber(rawNode.cy) ?? getNumber(rawNode['data-y']);
  if (x == null || y == null) return null;
  return { x, y };
};

const normalizeNodes = (rawNodes) => {
  const unique = new Map();
  rawNodes.forEach((node) => {
    if (!unique.has(node.id)) {
      unique.set(node.id, node);
    }
  });

  const list = Array.from(unique.values());
  const grid = buildGridPositions(list.length);
  return list.map((node, index) => {
    const position = extractPositions(node.raw) || grid[index];
    return {
      id: node.id,
      type: 'machineNode',
      position,
      data: {
        label: node.label || node.id,
        machineId: node.id,
        status: 'online',
        icon: 'Server',
      },
    };
  });
};

const normalizeEdges = (rawEdges, nodes) => {
  if (rawEdges.length > 0) {
    return rawEdges.map((edge, index) => ({
      id: edge.id || `edge-${index}`,
      source: edge.source,
      target: edge.target,
      animated: true,
      label: edge.label || 'Link',
    }));
  }

  const fallback = [];
  for (let i = 0; i < nodes.length - 1; i += 1) {
    fallback.push({
      id: `edge-${i}`,
      source: nodes[i].id,
      target: nodes[i + 1].id,
      animated: true,
      label: 'Flow',
    });
  }
  return fallback;
};

const parseSvgToIndustry = (svgMarkup) => {
  const parsed = parser.parse(svgMarkup || '');
  const collector = { nodes: [], edges: [], layers: new Set() };
  walkSvg(parsed, collector);

  const nodes = normalizeNodes(collector.nodes);
  const edges = normalizeEdges(collector.edges, nodes);

  return {
    nodes,
    edges,
    meta: {
      layers: Array.from(collector.layers),
      nodesExtracted: nodes.length,
      edgesExtracted: edges.length,
    },
  };
};

module.exports = { parseSvgToIndustry };
