export const state = {
  paths: [],
  currentPathIndex: 0,
  pathIdCounter: 0,
  colorIndex: 0,
  undoHistory: [],
  redoHistory: [],

  uploadedImage: null,
  imagePixelData: null,
  imageVisible: true,

  calibrationMode: false,
  calibrationAxis: null,
  calibrationPoints: [],
  calibrationOriginPoint: null,
  coordinateSystem: null,
  axisStyle: { xColor: '#ff0000', yColor: '#008800', width: 2 },

  imageScale: 1,
  imageOffset: { x: 0, y: 0 },

  panning: false,
  panStart: { x: 0, y: 0 },
  initialOffset: { x: 0, y: 0 },

  curveModel: 'free',

  draggingCP: null,
  dragOffset: { x: 0, y: 0 },

  mousePos: null,

  precisionMode: false,
  precisionCursor: { x: 0, y: 0 },

  hoveredCP: null,
  draggingPath: null,

  plotCanvas: null,
  plotCtx: null,
};

export const MAX_UNDO_HISTORY = 50;
export const CP_HIT_RADIUS = 6;
export const colorPalette = [
  '#ff0000', '#00ff00', '#0000ff', '#ff00ff', '#00ffff',
  '#ff8800', '#8800ff', '#00ff88', '#ff0088', '#88ff00'
];
