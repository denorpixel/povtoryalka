var board = null;
var game = new Chess();

var currentBranch = []; 
var currentPgnIndex = 0; 
var playerColor = 'w'; 
var errorCount = 0; 
var hintCount = 0; 
var progressDB = {}; 
var savedPgns = {}; 
var activeFilePath = '';
var isForcedRepeat = false; 
var currentDisplayComments = [];
var fullPgnTree = [];

var btnStart = document.getElementById('btn-start');
var btnHint = document.getElementById('btn-hint');
var statusText = document.getElementById('status-text');
var commentBox = document.getElementById('move-comment');
var movesHistoryDiv = document.getElementById('moves-history');
var valErr = document.getElementById('val-err');
var valHint = document.getElementById('val-hint');
var endModal = document.getElementById('end-modal');
var modalTitle = document.getElementById('modal-title');
var modalStats = document.getElementById('modal-stats');
var btnRetryYes = document.getElementById('btn-retry-yes');
var btnRetryNo = document.getElementById('btn-retry-no');
var treeDiv = document.getElementById('file-tree');
var pgnUpload = document.getElementById('pgn-upload');

document.addEventListener('DOMContentLoaded', function() {
  board = Chessboard('board', {
    position: 'start',
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
    draggable: true,
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd
  });

  loadDatabase();
  renderTree();

  btnStart.addEventListener('click', function() {
      if(currentBranch.length > 0) {
          isForcedRepeat = false; 
          startTraining();
      }
  });
  btnHint.addEventListener('click', showHint);
  
  pgnUpload.addEventListener('change', handleFileUpload);
});

function loadDatabase() {
    var db = localStorage.getItem('progressDB');
    if (db) { progressDB = JSON.parse(db); }
    
    var pgns = localStorage.getItem('savedPgns');
    if (pgns) { savedPgns = JSON.parse(pgns); }
}

function saveDatabase() {
    localStorage.setItem('progressDB', JSON.stringify(progressDB));
}

function handleFileUpload(e) {
    var files = e.target.files;
    if (files.length === 0) return;
    
    var filesProcessed = 0;
    for (var i = 0; i < files.length; i++) {
        (function(file) {
            var reader = new FileReader();
            reader.onload = function(evt) {
                var content = evt.target.result;
                savedPgns[file.name] = content;
                filesProcessed++;
                if (filesProcessed === files.length) {
                    localStorage.setItem('savedPgns', JSON.stringify(savedPgns));
                    renderTree();
                    pgnUpload.value = ''; // очистка
                }
            };
            reader.readAsText(file);
        })(files[i]);
    }
}

function deleteFile(fileName, event) {
    event.stopPropagation(); // чтобы не кликался сам файл
    if (confirm('Удалить ' + fileName + '?')) {
        delete savedPgns[fileName];
        delete progressDB[fileName];
        localStorage.setItem('savedPgns', JSON.stringify(savedPgns));
        saveDatabase();
        renderTree();
    }
}

function getTodayStr() { return new Date().toLocaleDateString('ru-RU'); }

function getDaysAgoStr(dateStr) {
    if (!dateStr) return 'Новый';
    var parts = dateStr.split('.');
    if (parts.length !== 3) return 'Новый';
    var d = new Date(parts[2], parts[1]-1, parts[0]);
    var now = new Date();
    now.setHours(0,0,0,0);
    var diff = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Сегодня';
    if (diff === 1) return 'Вчера';
    return diff + ' дн.';
}

function renderTree() {
  treeDiv.innerHTML = ''; 
  var fileNames = Object.keys(savedPgns);
  
  if (fileNames.length === 0) {
      treeDiv.innerHTML = '<div style="color:#888; padding: 10px;">Нажмите + PGN, чтобы добавить файлы</div>';
      return;
  }

  fileNames.forEach(function(fileName) {
    var el = document.createElement('div');
    el.className = 'tree-item file';
    
    var fileStats = progressDB[fileName];
    var fileStatus = 'Новый';
    var icon = '⚪';
    
    if (fileStats && fileStats.variants) {
        var passedToday = true;
        var oldestDate = getTodayStr();
        var keys = Object.keys(fileStats.variants);
        
        for (var i = 0; i < keys.length; i++) {
            var varData = fileStats.variants[keys[i]];
            var lastP = varData.lastPassed;
            if (lastP !== getTodayStr()) passedToday = false;
            if (!lastP) oldestDate = null; 
            else if (oldestDate && lastP < oldestDate) oldestDate = lastP;
        }
        
        if (keys.length > 0) {
            if (passedToday) { icon = '🟢'; fileStatus = 'Сдан'; } 
            else { icon = '🔴'; fileStatus = oldestDate ? getDaysAgoStr(oldestDate) : 'Есть новые'; }
        }
    }

    el.innerHTML = '<div class="item-name">📄 ' + fileName + '</div> <span class="item-status">' + icon + ' ' + fileStatus + ' <button class="btn-delete">x</button></span>';
    
    el.querySelector('.btn-delete').addEventListener('click', function(e) { deleteFile(fileName, e); });
    el.addEventListener('click', function() { handleFileClick(fileName, el); });
    
    treeDiv.appendChild(el);
  });
}

function handleFileClick(fileName, element) {
  var files = document.querySelectorAll('.file');
  for (var i = 0; i < files.length; i++) { files[i].classList.remove('active'); }
  element.classList.add('active');
  activeFilePath = fileName;

  statusText.textContent = 'Загрузка...';
  
  try {
      var pgnText = savedPgns[fileName];
      var parsedGames = window.pgnParser.parse(pgnText);
      if (parsedGames && parsedGames.length > 0 && parsedGames[0].moves) {
          fullPgnTree = parsedGames[0].moves;
          statusText.textContent = 'Тренировка загружена';
          isForcedRepeat = false;
          startTraining();
      } else {
          statusText.textContent = 'В файле нет ходов';
      }
  } catch (e) {
      statusText.textContent = 'Ошибка чтения PGN';
  }
}

function showCommentForNode(node, append) {
    if (!append) currentDisplayComments = [];
    if (node) {
        if (node.commentBefore) currentDisplayComments.push(node.commentBefore);
        if (node.commentMove) currentDisplayComments.push(node.commentMove);
        if (node.commentAfter) currentDisplayComments.push(node.commentAfter);
    }
    if (currentDisplayComments.length > 0) {
        commentBox.innerHTML = currentDisplayComments.join('<br><br>').replace(/\n/g, '<br>');
        commentBox.style.display = 'block';
        commentBox.scrollTop = commentBox.scrollHeight; 
    } else {
        commentBox.style.display = 'none';
        commentBox.innerHTML = '';
    }
}

function startTraining() {
    game.reset(); 
    board.position('start'); 
    currentPgnIndex = 0;
    errorCount = 0;
    hintCount = 0;
    updateStatsUI();
    endModal.style.display = 'none';
    
    if (!isForcedRepeat) { currentBranch = fullPgnTree; }

    playerColor = 'w'; 
    board.orientation('white');
    var activeFileName = activeFilePath.toLowerCase();
    
    if (activeFileName.indexOf('черными') !== -1 || activeFileName.indexOf('black') !== -1) {
        playerColor = 'b';
        board.orientation('black'); 
        statusText.textContent = "Вы играете за чёрных.";
        movesHistoryDiv.innerHTML = '';
        btnStart.disabled = false;
        btnHint.disabled = true;
        showCommentForNode(null, false); 
        setTimeout(function() { makeComputerMove(true); }, 400); 
        return;
    }
    
    movesHistoryDiv.innerHTML = '';
    statusText.textContent = "Ваш ход";
    btnStart.disabled = false;
    btnHint.disabled = false;
    showCommentForNode(null, false);
}

function onDragStart (source, piece) {
  if (game.game_over()) return false;
  if ((playerColor === 'w' && piece.search(/^b/) !== -1) || (playerColor === 'b' && piece.search(/^w/) !== -1)) return false;
  if (game.turn() !== playerColor) return false;
}

function showHint() {
    if (currentPgnIndex >= currentBranch.length) return;
    var expectedSan = currentBranch[currentPgnIndex].notation.notation;
    statusText.textContent = 'Подсказка: ожидается ход ' + expectedSan;
    hintCount++;
    updateStatsUI();
}

function updateStatsUI() {
    valErr.textContent = errorCount;
    valHint.textContent = hintCount;
}

function checkEndOfLine() {
    if (currentPgnIndex >= currentBranch.length) {
        btnHint.disabled = true;
        
        var currentLinePgn = game.pgn();
        var isPerfect = (errorCount === 0 && hintCount === 0);
        var today = getTodayStr();

        if (!progressDB[activeFilePath]) progressDB[activeFilePath] = { variants: {} };
        var fileStats = progressDB[activeFilePath];
        if (!fileStats.variants[currentLinePgn]) {
            fileStats.variants[currentLinePgn] = { errorsTotal: 0, hintsTotal: 0, lastPassed: null, playsToday: 0, lastPlayedDate: null };
        }
        var varStats = fileStats.variants[currentLinePgn];

        if (varStats.lastPlayedDate !== today) varStats.playsToday = 0;
        varStats.lastPlayedDate = today;
        varStats.playsToday++;

        if (isPerfect) varStats.lastPassed = today;
        else { varStats.errorsTotal += errorCount; varStats.hintsTotal += hintCount; }

        progressDB[activeFilePath] = fileStats;
        saveDatabase();

        setTimeout(function() {
            if (isPerfect) {
                modalTitle.textContent = "Идеально! Вариант сдан.";
                modalTitle.style.color = "#4ec9b0";
                modalStats.innerHTML = 'Пройдено за сегодня: <b>' + varStats.playsToday + ' раз(а)</b><br>Ошибок: 0 | Подсказок: 0';
                btnRetryYes.textContent = "Следующий вариант";
                btnRetryYes.onclick = function() { isForcedRepeat = false; startTraining(); };
                btnRetryNo.style.display = "inline-block"; 
            } else {
                modalTitle.textContent = "Нужно закрепить!";
                modalTitle.style.color = "#ff6b6b";
                modalStats.innerHTML = 'В этот раз ошибок: <b>' + errorCount + '</b> (Подсказок: ' + hintCount + ')<br><br><span style="color:#888; font-size:0.9em;">Всего ошибок в этом варианте за историю: ' + varStats.errorsTotal + '</span>';
                btnRetryYes.textContent = "Повторить этот вариант";
                btnRetryYes.onclick = function() { isForcedRepeat = true; startTraining(); };
                btnRetryNo.style.display = "none"; 
            }
            endModal.style.display = 'flex'; 
            renderTree(); 
        }, 600);
        return true;
    }
    return false;
}

function onDrop (source, target) {
  if (currentPgnIndex >= currentBranch.length) return 'snapback';

  var testMove = game.move({ from: source, to: target, promotion: 'q' });
  if (testMove === null) return 'snapback';
  game.undo(); 

  var expectedNode = currentBranch[currentPgnIndex];

  if (testMove.san === expectedNode.notation.notation) {
      game.move(testMove);
      currentPgnIndex++;
      statusText.textContent = "Правильно!";
      updateHistoryText();
      
      showCommentForNode(expectedNode, false); 
      
      if (!checkEndOfLine()) {
          btnHint.disabled = true; 
          setTimeout(function() { makeComputerMove(false); }, 300);
      }
  } else {
      errorCount++;
      updateStatsUI();
      statusText.textContent = 'Ошибка! Ожидался другой ход.';
      return 'snapback'; 
  }
}

function makeComputerMove(isFirstMove) {
    if (currentPgnIndex >= currentBranch.length) return;
    
    var mainNode = currentBranch[currentPgnIndex];
    var computerOptions = [];
    
    computerOptions.push({ node: mainNode, branch: currentBranch, nextIndex: currentPgnIndex + 1 });
    
    if (mainNode.variations && mainNode.variations.length > 0) {
        mainNode.variations.forEach(function(variationBranch) {
            if (variationBranch && variationBranch.length > 0) {
                computerOptions.push({ node: variationBranch[0], branch: variationBranch, nextIndex: 1 });
            }
        });
    }
    
    var chosenOption;
    
    if (isForcedRepeat) {
         chosenOption = computerOptions[0]; 
    } else {
        if (Math.random() < 0.2 || !progressDB[activeFilePath]) {
            chosenOption = computerOptions[Math.floor(Math.random() * computerOptions.length)];
        } else {
            chosenOption = computerOptions[Math.floor(Math.random() * computerOptions.length)];
        }
    }
    
    game.move(chosenOption.node.notation.notation);
    board.position(game.fen(), !isFirstMove); 
    
    currentBranch = chosenOption.branch;
    currentPgnIndex = chosenOption.nextIndex;
    
    statusText.textContent = "Ваш ход";
    updateHistoryText();
    btnHint.disabled = false; 
    
    showCommentForNode(chosenOption.node, true); 
    checkEndOfLine();
}

function onSnapEnd () { board.position(game.fen()); }

function updateHistoryText() {
    movesHistoryDiv.innerHTML = game.pgn();
    movesHistoryDiv.scrollTop = movesHistoryDiv.scrollHeight;
}

window.addEventListener('resize', function() { if (board) board.resize(); });