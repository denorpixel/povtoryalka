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
var activeFileColor = 'w';
var isForcedRepeat = false; 
var currentDisplayComments = [];
var fullPgnTree = [];
var computerMovesHistory = []; 
var savedComputerMoves = []; 

var currentParsedGames = [];
var activeChapterFen = 'start';

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

var pgnUploadW = document.getElementById('pgn-upload-w');
var pgnUploadB = document.getElementById('pgn-upload-b');

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
    
    btnRetryNo.addEventListener('click', function() {
        endModal.style.display = 'none';
    });
    
    var boardContainer = document.getElementById('board');
    if (boardContainer) {
        boardContainer.addEventListener('touchmove', function(e) {
            e.preventDefault();
        }, { passive: false });
    }
    
    pgnUploadW.addEventListener('change', function(e) { handleFileUpload(e, 'w'); });
    pgnUploadB.addEventListener('change', function(e) { handleFileUpload(e, 'b'); });
});

function loadDatabase() {
    try {
        var db = localStorage.getItem('progressDB');
        if (db && db !== "") { progressDB = JSON.parse(db); }
    } catch (e) { progressDB = {}; }
    
    try {
        var pgns = localStorage.getItem('savedPgns');
        if (pgns && pgns !== "") {
            var parsed = JSON.parse(pgns);
            for (var key in parsed) {
                if (typeof parsed[key] === 'string') {
                    var isBlack = (key.toLowerCase().indexOf('черными') !== -1 || key.toLowerCase().indexOf('black') !== -1);
                    savedPgns[key] = { content: parsed[key], folder: isBlack ? 'b' : 'w' };
                } else {
                    savedPgns[key] = parsed[key];
                }
            }
        }
    } catch (e) { savedPgns = {}; }
}

function saveDatabase() {
    localStorage.setItem('progressDB', JSON.stringify(progressDB));
}

function handleFileUpload(e, targetFolderColor) {
    var files = e.target.files;
    if (files.length === 0) return;
    
    var filesProcessed = 0;
    for (var i = 0; i < files.length; i++) {
        (function(file) {
            var reader = new FileReader();
            reader.onload = function(evt) {
                var content = evt.target.result;
                savedPgns[file.name] = { content: content, folder: targetFolderColor };
                filesProcessed++;
                if (filesProcessed === files.length) {
                    localStorage.setItem('savedPgns', JSON.stringify(savedPgns));
                    renderTree();
                    e.target.value = ''; 
                }
            };
            reader.readAsText(file);
        })(files[i]);
    }
}

function deleteFile(fileName, event) {
    event.stopPropagation(); 
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
        treeDiv.innerHTML = '<div style="color:#888; padding: 10px; text-align: center; font-size: 0.95em;">Нажмите кнопки сверху, чтобы добавить дебюты</div>';
        return;
    }

    var whiteFiles = fileNames.filter(function(name) { return savedPgns[name].folder === 'w'; });
    var blackFiles = fileNames.filter(function(name) { return savedPgns[name].folder === 'b'; });

    function createFolder(title, files, colorFolder) {
        var folderDiv = document.createElement('div');
        folderDiv.className = 'folder';

        var folderHeader = document.createElement('div');
        folderHeader.className = 'folder-header';
        folderHeader.innerHTML = '<span>📁 ' + title + ' (' + files.length + ')</span>';
        
        var folderContent = document.createElement('div');
        folderContent.className = 'folder-content';
        folderContent.style.display = files.length > 0 ? 'block' : 'none';

        folderHeader.onclick = function() {
            folderContent.style.display = (folderContent.style.display === 'none') ? 'block' : 'none';
        };

        files.forEach(function(fileName) {
            var el = document.createElement('div');
            el.className = 'tree-item file';
            if (activeFilePath === fileName) el.classList.add('active');
            
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
            el.addEventListener('click', function() { handleFileClick(fileName, colorFolder, el); });
            
            folderContent.appendChild(el);
        });

        folderDiv.appendChild(folderHeader);
        folderDiv.appendChild(folderContent);
        treeDiv.appendChild(folderDiv);
    }

    createFolder('За белых', whiteFiles, 'w');
    createFolder('За черных', blackFiles, 'b');
}

function handleFileClick(fileName, colorFolder, element) {
    var files = document.querySelectorAll('.file');
    for (var i = 0; i < files.length; i++) { files[i].classList.remove('active'); }
    element.classList.add('active');
    
    activeFilePath = fileName;
    activeFileColor = colorFolder;

    fullPgnTree = [];
    currentBranch = [];
    currentPgnIndex = 0;
    btnStart.disabled = true; 
    statusText.textContent = 'Загрузка...';
    
    try {
        var pgnText = savedPgns[fileName].content;
        var parsedGames = window.pgnParser.parse(pgnText);
        
        currentParsedGames = [];
        if (parsedGames && parsedGames.length > 0) {
            for (var i = 0; i < parsedGames.length; i++) {
                if (parsedGames[i].moves && parsedGames[i].moves.length > 0) {
                    currentParsedGames.push(parsedGames[i]);
                }
            }
        }
        
        if (currentParsedGames.length > 0) {
            statusText.textContent = 'Тренировка загружена';
            btnStart.disabled = false;
            isForcedRepeat = false;
            savedComputerMoves = [];
            startTraining();
        } else {
            statusText.textContent = 'В файле нет ходов';
        }
    } catch (e) {
        statusText.textContent = 'Ошибка PGN: проверьте файл';
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

function skipDummyNodes() {
    while (currentBranch && currentPgnIndex < currentBranch.length) {
        var node = currentBranch[currentPgnIndex];
        if (!node) break;
        
        var san = node.notation ? node.notation.notation : '';
        var isDummy = (!san || san === '.' || san === 'Z0' || san === '--' || san === '...' || san === '*');
        
        if (!isDummy) break; 
        
        showCommentForNode(node, true);
        currentPgnIndex++;
    }
}

function startTraining() {
    if (!isForcedRepeat) {
        var r = Math.floor(Math.random() * currentParsedGames.length);
        var activeGame = currentParsedGames[r];
        fullPgnTree = activeGame.moves;
        
        activeChapterFen = 'start';
        if (activeGame.headers) {
            for (var i = 0; i < activeGame.headers.length; i++) {
                if (activeGame.headers[i].name === 'FEN') {
                    activeChapterFen = activeGame.headers[i].value;
                    break;
                }
            }
        }
        savedComputerMoves = [];
    }
    
    if (activeChapterFen === 'start') {
        game.reset();
    } else {
        var loaded = game.load(activeChapterFen);
        if (!loaded) game.reset(); 
    }
    board.position(game.fen());
    
    currentBranch = fullPgnTree; 
    currentPgnIndex = 0;
    
    errorCount = 0;
    hintCount = 0;
    updateStatsUI();
    endModal.style.display = 'none';
    currentDisplayComments = [];
    showCommentForNode(null, false);
    
    computerMovesHistory = []; 

    skipDummyNodes(); 

    playerColor = activeFileColor; 
    board.orientation(playerColor === 'w' ? 'white' : 'black');
    
    var turnNow = game.turn();
    if (turnNow !== playerColor) {
        statusText.textContent = (playerColor === 'w') ? "Вы играете за белых. Ожидание..." : "Вы играете за чёрных.";
        movesHistoryDiv.innerHTML = '';
        btnStart.disabled = false;
        btnHint.disabled = true;
        setTimeout(function() { makeComputerMove(true); }, 400); 
        return;
    }
    
    movesHistoryDiv.innerHTML = '';
    statusText.textContent = "Ваш ход";
    btnStart.disabled = false;
    btnHint.disabled = false;
}

function onDragStart (source, piece) {
    if (game.game_over()) return false;
    if ((playerColor === 'w' && piece.search(/^b/) !== -1) || (playerColor === 'b' && piece.search(/^w/) !== -1)) return false;
    if (game.turn() !== playerColor) return false;
}

function getValidOptions(node, branch, index) {
    var options = [];
    if (!node) return options;
    
    var san = node.notation ? node.notation.notation : '';
    if (san && san !== '.' && san !== 'Z0' && san !== '--' && san !== '...' && san !== '*') {
        options.push({ san: san, node: node, branch: branch, nextIndex: index + 1 });
    }
    
    if (node.variations && node.variations.length > 0) {
        node.variations.forEach(function(vb) {
            if (vb && vb.length > 0) {
                var vNode = vb[0];
                var vSan = vNode.notation ? vNode.notation.notation : '';
                if (vSan && vSan !== '.' && vSan !== 'Z0' && vSan !== '--' && vSan !== '...' && vSan !== '*') {
                    options.push({ san: vSan, node: vNode, branch: vb, nextIndex: 1 });
                }
            }
        });
    }
    return options;
}

function showHint() {
    if (currentPgnIndex >= currentBranch.length) return;
    var expectedNode = currentBranch[currentPgnIndex];
    var validOptions = getValidOptions(expectedNode, currentBranch, currentPgnIndex);
    
    if (validOptions.length > 0) {
        var sans = validOptions.map(function(o) { return o.san; });
        statusText.textContent = 'Подсказка:\nожидается ' + sans.join(' или ');
    } else {
        statusText.textContent = 'Подсказка:\nЛиния завершена';
    }
    hintCount++;
    updateStatsUI();
}

function updateStatsUI() {
    valErr.textContent = errorCount;
    valHint.textContent = hintCount;
}

function checkEndOfLine() {
    var isEnd = false;
    if (currentPgnIndex >= currentBranch.length) {
        isEnd = true;
    } else {
        var expectedNode = currentBranch[currentPgnIndex];
        var validOptions = getValidOptions(expectedNode, currentBranch, currentPgnIndex);
        if (validOptions.length === 0) isEnd = true;
    }

    if (isEnd) {
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
                btnRetryYes.onclick = function() { 
                    isForcedRepeat = true; 
                    savedComputerMoves = computerMovesHistory.slice(); 
                    startTraining(); 
                };
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
    var validOptions = getValidOptions(expectedNode, currentBranch, currentPgnIndex);

    var matchedOption = null;
    for (var i = 0; i < validOptions.length; i++) {
        if (testMove.san === validOptions[i].san) {
            matchedOption = validOptions[i];
            break;
        }
    }

    if (matchedOption) {
        game.move(testMove);
        currentPgnIndex = matchedOption.nextIndex;
        currentBranch = matchedOption.branch;
        
        statusText.textContent = "Правильно!";
        updateHistoryText();
        
        showCommentForNode(matchedOption.node, false); 
        skipDummyNodes();
        
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
    var computerOptions = getValidOptions(mainNode, currentBranch, currentPgnIndex);
    
    if (computerOptions.length === 0) {
        checkEndOfLine();
        return;
    }
    
    var chosenOption = null;
    if (isForcedRepeat && savedComputerMoves.length > 0) {
         var expectedSan = savedComputerMoves.shift();
         for (var i = 0; i < computerOptions.length; i++) {
             if (computerOptions[i].san === expectedSan) {
                 chosenOption = computerOptions[i];
                 break;
             }
         }
    }
    
    if (!chosenOption) {
         chosenOption = computerOptions[Math.floor(Math.random() * computerOptions.length)];
    }
    
    computerMovesHistory.push(chosenOption.san);
    
    var moveRes = game.move(chosenOption.san);
    if (!moveRes) {
        moveRes = game.move(chosenOption.san, {sloppy: true});
    }
    
    board.position(game.fen(), !isFirstMove); 
    
    currentBranch = chosenOption.branch;
    currentPgnIndex = chosenOption.nextIndex;
    
    statusText.textContent = "Ваш ход";
    updateHistoryText();
    btnHint.disabled = false; 
    
    showCommentForNode(chosenOption.node, true); 
    skipDummyNodes();
    checkEndOfLine();
}

function onSnapEnd () { board.position(game.fen()); }

function updateHistoryText() {
    movesHistoryDiv.innerHTML = game.pgn();
    movesHistoryDiv.scrollTop = movesHistoryDiv.scrollHeight;
}

window.addEventListener('resize', function() { if (board) board.resize(); });
