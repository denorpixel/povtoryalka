/**
 * Standalone PGN Parser for Chess Repeater (Offline PWA)
 * A lightweight, drop-in replacement for @mliebelt/pgn-parser.
 * Generates the exact AST (Abstract Syntax Tree) required by app.js.
 */
window.pgnParser = (function() {
    function parse(pgnString) {
        // Убираем заголовки (теги в квадратных скобках), оставляем только ходы
        var body = pgnString.replace(/\[.*?\]/g, '').trim();
        
        var tokens = [];
        var i = 0;
        
        // Шаг 1: Токенизация (разбиваем текст на осмысленные кусочки)
        while (i < body.length) {
            var char = body[i];
            
            if (/\s/.test(char)) {
                i++;
                continue;
            }
            if (char === '{') {
                var end = body.indexOf('}', i);
                if (end === -1) end = body.length;
                tokens.push({ type: 'Comment', value: body.substring(i + 1, end).trim() });
                i = end + 1;
                continue;
            }
            if (char === ';') {
                var endLine = body.indexOf('\n', i);
                if (endLine === -1) endLine = body.length;
                tokens.push({ type: 'Comment', value: body.substring(i + 1, endLine).trim() });
                i = endLine + 1;
                continue;
            }
            if (char === '(') { tokens.push({ type: 'OpenVar' }); i++; continue; }
            if (char === ')') { tokens.push({ type: 'CloseVar' }); i++; continue; }
            if (char === '$') {
                // Пропускаем символы оценки ходов (NAGs), например $1, $2
                var endNag = i + 1;
                while (endNag < body.length && /[0-9]/.test(body[endNag])) endNag++;
                i = endNag;
                continue;
            }
            
            var match = body.substring(i).match(/^[^\s\(\)\{\}\$]+/);
            if (match) {
                var val = match[0];
                var numMoveMatch = val.match(/^([0-9]+)\.+(.+)$/);
                
                if (numMoveMatch) {
                    // Обработка слипшихся ходов, например "1.e4" или "2...Nf6"
                    var actualMove = numMoveMatch[2];
                    if (actualMove !== '1-0' && actualMove !== '0-1' && actualMove !== '1/2-1/2' && actualMove !== '*') {
                         tokens.push({ type: 'Move', value: actualMove });
                    }
                } else if (/^[0-9]+\.+$/.test(val)) {
                    // Пропускаем номера ходов (например "1.", "2...")
                } else if (val === '1-0' || val === '0-1' || val === '1/2-1/2' || val === '*') {
                    // Пропускаем результат игры
                } else {
                    tokens.push({ type: 'Move', value: val });
                }
                i += val.length;
                continue;
            }
            i++; 
        }

        // Шаг 2: Построение дерева ходов (AST)
        var rootMoves = [];
        var stack = [rootMoves];
        var currentLevelMoves = rootMoves;
        var lastMoveNode = null;

        for (var t = 0; t < tokens.length; t++) {
            var token = tokens[t];
            
            if (token.type === 'Move') {
                var node = {
                    notation: { notation: token.value },
                    variations: [],
                    commentBefore: null,
                    commentMove: null,
                    commentAfter: null
                };
                currentLevelMoves.push(node);
                lastMoveNode = node;
            } else if (token.type === 'OpenVar') {
                var newVar = [];
                if (lastMoveNode) {
                    lastMoveNode.variations.push(newVar);
                } else {
                    currentLevelMoves.push(newVar);
                }
                stack.push(newVar);
                currentLevelMoves = newVar;
            } else if (token.type === 'CloseVar') {
                if (stack.length > 1) {
                    stack.pop();
                    currentLevelMoves = stack[stack.length - 1];
                    // После закрытия варианта lastMoveNode сбрасывать не нужно,
                    // следующий ход или комментарий будет относиться к уровню выше.
                }
            } else if (token.type === 'Comment') {
                // Если комментарий идёт ДО первого хода в ветке
                if (currentLevelMoves.length === 0) {
                    // В текущем парсере мы просто добавляем фиктивный узел для сохранения коммента
                    // В реальной жизни это редко нужно, но оставим для совместимости
                    var fakeNode = {
                        notation: { notation: '' },
                        variations: [],
                        commentBefore: token.value,
                        commentMove: null,
                        commentAfter: null
                    };
                    currentLevelMoves.push(fakeNode);
                    lastMoveNode = fakeNode;
                } else if (lastMoveNode) {
                    // Добавляем комментарий ПОСЛЕ хода
                    if (!lastMoveNode.commentAfter) {
                        lastMoveNode.commentAfter = token.value;
                    } else {
                        lastMoveNode.commentAfter += " " + token.value;
                    }
                }
            }
        }
        
        return [{ moves: rootMoves }];
    }

    return { parse: parse };
})();