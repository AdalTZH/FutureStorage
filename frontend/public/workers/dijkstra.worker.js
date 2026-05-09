class MinHeap {
  constructor() { this.heap = []; }
  push(item) { this.heap.push(item); this._bubbleUp(this.heap.length - 1); }
  pop() {
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) { this.heap[0] = last; this._sinkDown(0); }
    return top;
  }
  isEmpty() { return this.heap.length === 0; }
  _bubbleUp(i) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.heap[parent][0] <= this.heap[i][0]) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }
  _sinkDown(i) {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.heap[l][0] < this.heap[smallest][0]) smallest = l;
      if (r < n && this.heap[r][0] < this.heap[smallest][0]) smallest = r;
      if (smallest === i) break;
      [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
      i = smallest;
    }
  }
}

function dijkstra(nodes, edges, startId, targetId) {
  const dist    = new Map();
  const prev    = new Map();
  const visited = new Set();
  const pq      = new MinHeap();

  nodes.forEach((_, id) => dist.set(id, Infinity));
  dist.set(startId, 0);
  pq.push([0, startId]);

  const BATCH_SIZE = 20;
  let batch = [];

  while (!pq.isEmpty()) {
    const [d, current] = pq.pop();
    if (visited.has(current)) continue;
    visited.add(current);

    batch.push({ type: 'explore', nodeId: current, coord: nodes.get(current), dist: d });
    if (batch.length >= BATCH_SIZE) {
      self.postMessage({ type: 'batch', frames: batch });
      batch = [];
    }

    if (current === targetId) break;

    for (const { to, weight, segment } of (edges.get(current) || [])) {
      const newDist = d + weight;
      if (newDist < dist.get(to)) {
        dist.set(to, newDist);
        prev.set(to, { from: current, segment });
        pq.push([newDist, to]);
        batch.push({ type: 'relax', segment, newDist });
      }
    }
  }

  if (batch.length > 0) self.postMessage({ type: 'batch', frames: batch });

  const path = [];
  let cur = targetId;
  while (prev.has(cur)) {
    const { from, segment } = prev.get(cur);
    path.unshift(segment);
    cur = from;
  }

  self.postMessage({ type: 'path_found', path, totalDist: dist.get(targetId) });
}

self.onmessage = ({ data }) => {
  const { nodes, edges, startId, targetId } = data;
  dijkstra(new Map(nodes), new Map(edges), startId, targetId);
};
