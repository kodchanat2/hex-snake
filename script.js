const FPT = 12;
const FPS = 60;
const showFPS = false;
const TileSize = 2;
const gridWidth = 25;
const gridHeight = 29;
const tailWidth = 5;
const colors = {
  TILE: "#081905",
  WALL: "#333333",
  BODY: "#081905",
  BODY_WITH_ITEM: "#481905",
  ITEM: "#ff6666",
}
const state = {
  EMPTY: 0,
  ITEM: -1,
  BODY_WITH_ITEM: 1,
  BODY: 2,
  WALL: 9,
}

var canvas = document.getElementById("canvas");
var react = canvas.getBoundingClientRect();
var ctx = canvas.getContext("2d");
var frameCount = 0;
var lastCalledTime;
var screen_scale = 1;
var highscore = 0;
var score = 0;
var animateScore = 0;
var scoreScale = 1;
// var loading = false;
var grid = new Map();
var isBotEnabled = false;
var delayedClickToggleBot = 0;
var botMoveList = [];
var currentTile = {
  i: 0,
  j: 0,
}
var tailTile = {
  i: 0,
  j: 0,
}
var itemTile = {
  i: 0,
  j: 0,
}

function init() {
  canvas.width = react.width;
  canvas.height = react.height;
  screen_scale = canvas.width / 100;
  canvas.addEventListener("click", touch);
  canvas.addEventListener("touchstart", (e) => touch(e.touches[0]));
  canvas.addEventListener("touchmove", (e) => touch(e.touches[0]));
  canvas.addEventListener("touchend", (e) => touch(e.touches[0]));
  highscore = loadScore();
  ctx.textBaseline = "top";
  creatGrid();
  setInterval(update, 1000 / FPS);
}

setFontSize = (size = 7) => ctx.font = screen_scale * size + "px comic sans ms";

async function touch(e) {
  if (!e) return;
  // if (loading) return;
  // loading = true;
  var react = canvas.getBoundingClientRect();
  var x = (e.clientX - react.left) / screen_scale;
  var y = (e.clientY - react.top) / screen_scale;
  // console.log(x, y);
  if (y < 10 && x > 90) {
    saveScore();
    window.location.reload();
    return;
  }
  if (y > 190 && x < 20) {
    if (delayedClickToggleBot) return;
    delayedClickToggleBot = FPS * 2;
    isBotEnabled = !isBotEnabled;
    return;
  }
  if (isBotEnabled) botMoveList = [];
  isBotEnabled = false;
  controller.touch(x, y);
}

function creatGrid() {
  const halfX = Math.floor(gridWidth / 2);
  const start = {
    x: 50 - TileSize * Math.sin(Math.PI / 3) * 2 * halfX,
    y: 75 - TileSize * 2 * gridHeight / 2,
  }
  for (let i = 0; i < gridWidth; i++) {
    for (let j = 0; j < gridHeight; j++) {
      if (j >= halfX - i && j < gridHeight + halfX - i) {
        var isStart = i === halfX && j === Math.floor(gridHeight / 2);
        const tile = new Tile(start.x + i * TileSize * 2 * Math.sin(Math.PI / 3), start.y + j * TileSize * 2 + Math.round(i - gridWidth / 2) * TileSize, PosToText(i, j));
        if (isStart && !currentTile.i) {
          tile.moveHere(score + tailWidth);
          tailTile = TextToPos(tile.pos);
        }
        grid.set(tile.pos, tile);
      }
    }
  }
  setItemTile();
}

function setItemTile() {
  const blankTiles = [...grid].filter(([pos, tile]) => tile.state === state.EMPTY);
  var i = Math.floor(Math.random() * blankTiles.length);
  blankTiles[i][1].setItem();
  itemTile = TextToPos(blankTiles[i][0]);
}

async function update() {
  // console.log(spawn_pool, board, poping_pool)
  if (frameCount++ >= FPT) {
    frameCount = 0;
    tick();
  }
  if (delayedClickToggleBot) delayedClickToggleBot--;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  animating = false;
  draw.bg();
  draw.grid();
  controller.draw();
}

function tick() {
  if (isBotEnabled) {
    // console.log(botMoveList)
    if (!botMoveList.length)
      botMoveList = findPath(itemTile);
    var nextTile = botMoveList.shift();
    if (nextTile) controller.dir = posToDir(currentTile, TextToPos(nextTile.pos));
  }
  var dir = controller.dir;
  var vector = dirToPos(dir);
  var target = {
    i: currentTile.i + vector.i,
    j: currentTile.j + vector.j,
  }
  var currentTileItem = grid.get(PosToText(currentTile.i, currentTile.j));
  var targetTile = grid.get(PosToText(target.i, target.j));
  // console.log(controller.dir, target, targetTile)
  if (targetTile) {
    if (targetTile.state === state.EMPTY)
      grid.forEach(tile => {
        tile.tick();
      });
    if (targetTile.state === state.ITEM) {
      setItemTile();
      score++;
    }
    currentTileItem.setLinkDir(dir);
    targetTile.moveHere(score + tailWidth);
  } else {
    // gameover
  }
}


/*========== Draw  ==========*/

const draw = {
  bg: () => {
    var grd = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grd.addColorStop(0, '#749D4E');
    grd.addColorStop(1, '#869955');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = "start";
    ctx.fillStyle = "black";
    if (animateScore < score && scoreScale < 1.1) {
      animateScore += Math.ceil((score - animateScore) / 10);
      scoreScale = 1.2;
    }
    setFontSize(7 * scoreScale);
    if (scoreScale > 1.001) scoreScale -= (scoreScale - 1) / 10;
    ctx.fillText("score: " + animateScore, 2 * screen_scale, 7 * screen_scale);
    setFontSize(3)
    ctx.fillText("highscore: " + highscore, 2 * screen_scale, 3 * screen_scale);

    ctx.fillStyle = '#749D4E';
    ctx.fillRect(0, 190 * screen_scale, 20 * screen_scale, 10 * screen_scale);
    setFontSize(4)
    ctx.fillStyle = "black";
    ctx.fillText(`Bot: ${isBotEnabled ? 'on' : 'off'}`, 2 * screen_scale, 193 * screen_scale);
    setFontSize(10);
    ctx.fillText("↻", 92 * screen_scale, 2 * screen_scale);

    if (showFPS) {
      var fps = 0;
      if (!lastCalledTime) {
        lastCalledTime = Date.now();
        fps = 0;
      }
      else {
        var delta = (Date.now() - lastCalledTime) / 1000;
        lastCalledTime = Date.now();
        fps = 1 / delta;
      }
      ctx.scale(0.5, 0.5);
      ctx.fillText(Math.round(fps), 4 * screen_scale, 30 * screen_scale);
      ctx.scale(2, 2);
    }
  },

  tile: (x, y, size) => {
    ctx.beginPath();
    ctx.moveTo(x + size * Math.cos(0), y + size * Math.sin(0));

    for (var side = 0; side < 7; side++) {
      ctx.lineTo(x + size * Math.cos(side * 2 * Math.PI / 6), y + size * Math.sin(side * 2 * Math.PI / 6));
    }
  },

  grid: () => {
    grid.forEach(tile => {
      tile.update();
    });
  }
}

/*========== Controller  ==========*/
const controller = {
  dir: 4,
  touch: (x, y) => {
    var rad = Math.atan2(y - 160, x - 50);
    var dir = Math.floor(rad / (Math.PI * 2 / 6));
    controller.dir = (dir + 6) % 6;
  },
  draw: () => {
    var color = isBotEnabled ? colors.BODY_WITH_ITEM : colors.TILE;
    draw.tile(50 * screen_scale, 160 * screen_scale, 20 * screen_scale);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.lineWidth = 1;
    // current dir
    ctx.beginPath();
    var x = 50 + 10 * Math.cos(controller.dir * Math.PI / 3 + Math.PI / 6);
    var y = 160 + 10 * Math.sin(controller.dir * Math.PI / 3 + Math.PI / 6);
    // ctx.arc(this.x * screen_scale, this.y * screen_scale, TileSize * 0.7 * screen_scale, 0, 2 * Math.PI);
    ctx.arc(x * screen_scale, y * screen_scale, 5 * screen_scale, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

function TextToPos(pos) {
  var [i, j] = pos.split('_');
  i = (i[0] === 'P' ? 1 : -1) * Number(i.slice(1));
  j = (j[0] === 'P' ? 1 : -1) * Number(j.slice(1));
  return { i, j };
}
function PosToText(i, j) {
  return `${i >= 0 ? 'P' : 'N'}${Math.abs(i)}_${j >= 0 ? 'P' : 'N'}${Math.abs(j)}`;
}
function dirToPos(dir) {
  switch (dir) {
    case 0:
      return { i: 1, j: 0 };
    case 1:
      return { i: 0, j: 1 };
    case 2:
      return { i: -1, j: 1 };
    case 3:
      return { i: -1, j: 0 };
    case 4:
      return { i: 0, j: -1 };
    case 5:
      return { i: 1, j: -1 };
    default:
      return { i: 0, j: 0 };
  }
}
function posToDir(start, end) {
  var dir = Math.floor(Math.atan2(end.j - start.j, end.i - start.i) / (Math.PI * 2 / 6));
  return (dir + 6) % 6;
}



/*========== Tile  ==========*/
class Tile {
  constructor(x, y, pos) {
    this.x = x;
    this.y = y;
    this.pos = pos;
    this.state = state.EMPTY;
    this.size = 0;
    this.alpha = 0;
    this.targetSize = 0;
    this.targetAlpha = 0;
    this.linkDir = -1;
    this.decay = 0;

    // bot
    this.connection = null;
    this.h = 0;
    this.g = 0;
    this.f = this.g + this.h;
  }

  moveHere(life) {
    if (this.state > 0) {
      // gameover
      return;
    }
    currentTile = TextToPos(this.pos);
    this.state += state.BODY;
    this.decay = life;
    if (this.state === state.BODY) {
      this.targetSize = 1;
    } else if (this.state === state.BODY_WITH_ITEM) {
      this.targetSize = 1.5;
    }
    this.targetAlpha = 1;
  }

  setItem() {
    if (this.state > 0) {
      // cant set item
      return;
    }
    this.state = state.ITEM;
    this.targetSize = 1.2;
    this.targetAlpha = 1;
  }

  setLinkDir(dir) {
    this.linkDir = dir;
  }

  tick() {
    if (this.decay > 0) {
      this.decay--;
      if (this.decay === 0) {
        var pos = dirToPos(this.linkDir);
        tailTile.i += pos.i;
        tailTile.j += pos.j;
        this.state = state.EMPTY;
        this.targetSize = 0.7;
      }
    } else if (this.state > 0 && this.state < 5) {
      this.state = state.EMPTY;
      this.linkDir = -1;
      this.targetSize = 0;
      this.targetAlpha = 0;
    }
  }

  setGH(g, h) {
    this.g = g;
    this.h = h;
    this.f = g + h;
  }

  getDistance(pos) {
    var { i, j } = pos;
    return Math.max(Math.abs(i - itemTile.i), Math.abs(j - itemTile.j));
  }

  update() {
    if (this.size !== this.targetSize) {
      this.size += (this.targetSize - this.size) / 5;
      if (Math.abs(this.size - this.targetSize) < 0.01) this.size = this.targetSize;
    }
    if (this.alpha !== this.targetAlpha) {
      this.alpha += (this.targetAlpha - this.alpha) / 5;
      if (Math.abs(this.alpha - this.targetAlpha) < 0.01) this.alpha = this.targetAlpha;
    }

    draw.tile(this.x * screen_scale, this.y * screen_scale, TileSize * screen_scale);
    if (this.state !== state.WALL) {
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = colors.TILE;
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = colors.WALL;
      ctx.fill();
    }

    if (this.state === state.ITEM) {
      this.drawItem();
    }
    else {
      ctx.globalAlpha = this.alpha;
      if (this.state > 0 && this.state < 5) {
        if (this.state === state.BODY)
          ctx.fillStyle = colors.BODY;
        else if (this.state === state.BODY_WITH_ITEM)
          ctx.fillStyle = colors.BODY_WITH_ITEM;
        if (false && PosToText(tailTile.i, tailTile.j) === this.pos)
          ctx.fillStyle = 'red';
        ctx.fill();

        if (this.linkDir >= 0 && this.pos !== PosToText(currentTile.i, currentTile.j)) {
          var x = this.x + TileSize * Math.cos(this.linkDir * Math.PI / 3 + Math.PI / 6);
          var y = this.y + TileSize * Math.sin(this.linkDir * Math.PI / 3 + Math.PI / 6);
          ctx.arc(x * screen_scale, y * screen_scale, TileSize / 2 * screen_scale, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  drawItem() {
    ctx.beginPath();
    ctx.arc(this.x * screen_scale, this.y * screen_scale, TileSize * 0.7 * screen_scale, 0, 2 * Math.PI);
    ctx.globalAlpha = this.alpha;
    if (this.size !== 0)
      ctx.scale(this.size, this.size);

    ctx.fillStyle = colors.ITEM;
    ctx.fill();
    ctx.strokeStyle = "white";
    ctx.stroke();

    ctx.globalAlpha = 1;
    if (this.size !== 0)
      ctx.scale(1 / this.size, 1 / this.size);
  }
}

// score
function saveScore() {
  highscore = Math.max(score, highscore);
  var d = new Date();
  d.setTime(d.getTime() + (365 * 24 * 60 * 60 * 1000));
  var expires = "expires=" + d.toUTCString();
  document.cookie = "score=" + highscore + ";" + expires + ";path=/";
}

function loadScore() {
  var name = "score=";
  var ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    var c = ca[i].trim();
    if (c.indexOf(name) === 0) {
      return c.substring(name.length, c.length);
    }
  }
  return 0;
}

findPath = (itemPos, isTail) => {
  console.log('start find path');
  var targetPos = itemPos;
  if (isTail) targetPos = tailTile;
  var openList = [];
  var closedList = [];
  var start = grid.get(PosToText(currentTile.i, currentTile.j));
  var end = grid.get(PosToText(targetPos.i, targetPos.j));
  var tail = grid.get(PosToText(tailTile.i, tailTile.j));
  start.setGH(0, start.getDistance(targetPos));
  start.connection = null;
  openList.push(start);
  var loopExit = 999;
  var isReachEnd = false;
  var result = [];

  while (openList.length > 0 && loopExit-- > 0) {
    var current = openList[0];
    if (!isReachEnd && !isTail) tail = _getNextTail(tail);
    for (let i = 1; i < openList.length; i++) {
      if (openList[i].f < current.f || openList[i].f === current.f && openList[i].h < current.h) {
        current = openList[i];
      }
    }
    openList = openList.filter(tile => tile !== current);
    closedList.push(current);

    if (current === end) {
      // console.log('reach end')
      var temp = current;
      while (temp.connection) {
        result.unshift(temp);
        temp = temp.connection;
      }
      isReachEnd = true;
      openList = [];
    }
    if (isReachEnd && (!tail || current === tail)) {
      // console.log('found')
      if (isTail) return result.slice(0, 1);
      return result;
    }
    if (isReachEnd) targetPos = TextToPos(tail.pos);

    var currentPos = TextToPos(current.pos);
    var neighborsPos = [
      { i: currentPos.i + 1, j: currentPos.j },
      { i: currentPos.i, j: currentPos.j + 1 },
      { i: currentPos.i - 1, j: currentPos.j + 1 },
      { i: currentPos.i - 1, j: currentPos.j },
      { i: currentPos.i, j: currentPos.j - 1 },
      { i: currentPos.i + 1, j: currentPos.j - 1 },
    ];
    neighborsPos.forEach(pos => {
      var tile = grid.get(PosToText(pos.i, pos.j));
      if (tile && closedList.includes(tile)) return;
      if (tile && (tile.state <= state.EMPTY || tile.decay - current.g < 0)) {
        var g = current.g + 1;
        var h = tile.getDistance(targetPos);
        if (!openList.includes(tile) || g < tile.g) {
          tile.setGH(g, h);
          tile.connection = current;
          if (!openList.includes(tile)) openList.push(tile);
        }
      }
    });
  }
  if (loopExit <= 0) console.error('timeout');
  if (isTail) {
    isBotEnabled = false;
    return [];
  }
  return findPath(tailTile, true);

  function _getNextTail(tail) {
    if (!tail || tail.linkDir < 0) return;
    var { i, j } = TextToPos(tail.pos);
    var pos = dirToPos(tail.linkDir);
    i += pos.i;
    j += pos.j;
    return grid.get(PosToText(i, j));
  }
}


init();