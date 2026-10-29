import {
    FontSizes,
    PADDING,
    THEME,
    createHighlight,
    drawRoundedRectangle,
    drawRoundedRectangleWithBorder,
    drawText,
    easeInOutQuad,
    easeOutCubic,
    getTextWidth,
    interpolateColor,
    isInside,
    playClickSound,
    TypingState,
    drawRect,
    getTypedCharacter,
    setTextInputArea,
    startTextInput,
    stopTextInput,
} from '../Utils';
import { setTooltip } from '../core/GuiTooltip';
import { GuiState } from '../core/GuiState';
import { DataFlavor, ScriptKey, Toolkit } from '../../utils/Constants';
import { Keyboard } from '../../utils/Keyboard';

export class MultiToggle {
    constructor(title, x, y, options = [], singleSelect = false, callback = null, defaultValue = false, allowNone = false) {
        this.title = title;
        this.x = x;
        this.y = y;
        this.singleSelect = singleSelect;
        this.allowNone = !!allowNone;

        this.options = options.map((option) => {
            if (typeof option === 'string') {
                return {
                    name: option,
                    enabled: false,
                    animationProgress: 0,
                    animationStart: 0,
                    val1: '',
                    val2: '',
                    placeholder1: '',
                    placeholder2: '',
                    isTyping1: false,
                    isTyping2: false,
                    cursorIndex1: 0,
                    cursorIndex2: 0,
                    scrollX1: 0,
                    scrollX2: 0,
                    textX1: 0,
                    textX2: 0,
                };
            }
            return {
                name: option.name,
                enabled: option.enabled || false,
                animationProgress: option.enabled ? 1 : 0,
                animationStart: 0,
                val1: option.val1 || '',
                val2: option.val2 || '',
                placeholder1: option.placeholder1 || '',
                placeholder2: option.placeholder2 || '',
                isTyping1: false,
                isTyping2: false,
                cursorIndex1: 0,
                cursorIndex2: 0,
                scrollX1: 0,
                scrollX2: 0,
                textX1: 0,
                textX2: 0,
            };
        });

        const normalizeDefaultNames = (value) => {
            if (!Array.isArray(value)) return null;

            const names = [];
            for (const entry of value) {
                if (typeof entry === 'string') {
                    names.push(entry);
                    continue;
                }

                if (entry && typeof entry.name === 'string' && entry.enabled !== false) {
                    names.push(entry.name);
                }
            }

            return names;
        };

        const defaultNames = normalizeDefaultNames(defaultValue);

        if (Array.isArray(defaultValue)) {
            const defaultSet = new Set(defaultNames || []);
            this.options.forEach((option) => {
                if (defaultSet.has(option.name)) {
                    option.enabled = true;
                    option.animationProgress = 1;
                }
            });
        } else if (defaultValue) {
            const defaultIndex = options.indexOf(defaultValue);
            if (defaultIndex !== -1) {
                this.options[defaultIndex].enabled = true;
                this.options[defaultIndex].animationProgress = 1;
            }
        }

        if (this.singleSelect) {
            let firstEnabledIndex = -1;
            this.options.forEach((option, index) => {
                if (!option.enabled) return;
                if (firstEnabledIndex === -1) {
                    firstEnabledIndex = index;
                    return;
                }

                option.enabled = false;
                option.animationProgress = 0;
            });
        }

        if (this.singleSelect && !this.allowNone && !this.options.some((option) => option.enabled) && this.options.length > 0) {
            this.options[0].enabled = true;
            this.options[0].animationProgress = 1;
        }
        this.expanded = false;
        this.optionHeight = 18;
        this.containerHeight = 24;
        this.callback = callback;
        this.optionPanelWidth = 0;
        this.dropdownPadding = 6;
        this.optionSpacing = 3;
        this.dropdownOuterPadding = 10;

        this.animStart = 0;
        this.animFrom = 0;
        this.animTo = 0;
        this.animDuration = 220;
        this.animationProgress = 0;
        this.description = null;
        this.highlight = createHighlight();

        this.inputBoxWidth = 44;
        this.inputBoxHeight = 16;
        this.inputBoxGap = 4;
        this.focusedOptionIndex = -1;
        this.focusedField = null;

        register('guiKey', (char, keyCode, gui, event) => {
            if (!GuiState.myGui.isOpen()) return;
            if (this.focusedOptionIndex !== -1 && this.focusedField !== null && this.handleKeyType(char, keyCode)) {
                cancel(event);
            }
        });
    }

    startAnimation(expanding) {
        this.animStart = Date.now();
        this.animFrom = this.animationProgress;
        this.animTo = expanding ? 1 : 0;
    }

    updateAnimation() {
        if (this.animStart === 0) return;
        const elapsed = Date.now() - this.animStart;
        const t = Math.min(elapsed / this.animDuration, 1);
        const eased = easeInOutQuad(t);
        this.animationProgress = this.animFrom + (this.animTo - this.animFrom) * eased;
        if (t >= 1) this.animStart = 0;
    }

    startHighlight() {
        this.highlight.startHighlight();
    }

    drawHighlight(panelWidth, panelHeight) {
        this.highlight.draw({
            x: this.x,
            y: this.y,
            width: panelWidth,
            height: panelHeight,
            accentColor: THEME.ACCENT,
            accentFillColor: THEME.ACCENT_DIM,
        });
    }

    updateToggleAnimations() {
        this.options.forEach((option) => {
            if (option.animationStart === 0) {
                option.animationProgress = option.enabled ? 1 : 0;
                return;
            }

            const elapsed = Date.now() - option.animationStart;
            const t = Math.min(elapsed / this.animDuration, 1);
            const target = option.enabled ? 1 : 0;

            option.animationProgress = option.animationProgress + (target - option.animationProgress) * easeOutCubic(t);

            if (t >= 1) {
                option.animationProgress = target;
                option.animationStart = 0;
            }
        });
    }

    getExpandedContentHeight() {
        const gaps = Math.max(0, this.options.length - 1);
        return this.options.length * this.optionHeight + gaps * this.optionSpacing + this.dropdownPadding * 2;
    }

    getExpandedHeight() {
        return this.getExpandedContentHeight() + this.dropdownOuterPadding;
    }

    drawInputBox(option, boxX, boxY, boxWidth, boxHeight, val, placeholder, isTyping, cursorIndex, scrollX, textX, fieldIndex, optionIndex, mouseX, mouseY) {
        const isHovered = isInside(mouseX, mouseY, { x: boxX, y: boxY, width: boxWidth, height: boxHeight });

        const displayText = val || (isTyping ? '' : placeholder);
        const textColor = isTyping ? THEME.TEXT : (val ? THEME.TEXT_DIM : THEME.TEXT_MUTED);
        const borderColor = isTyping ? THEME.ACCENT : (isHovered ? THEME.BORDER : THEME.BORDER);

        drawRoundedRectangleWithBorder({
            x: boxX,
            y: boxY,
            width: boxWidth,
            height: boxHeight,
            radius: 4,
            color: isTyping ? THEME.BG_COMPONENT : THEME.BG_INSET,
            borderWidth: 1,
            borderColor,
        });

        const visibleWidth = boxWidth - 10;
        const cursorText = displayText.slice(0, cursorIndex);
        const cursorPixelX = getTextWidth(cursorText, FontSizes.REGULAR);

        if (isTyping) {
            if (cursorPixelX < scrollX) {
                scrollX = cursorPixelX;
            } else if (cursorPixelX > scrollX + visibleWidth) {
                scrollX = cursorPixelX - visibleWidth;
            }
        }

        const maxScroll = Math.max(0, getTextWidth(displayText, FontSizes.REGULAR) - visibleWidth);
        if (!isTyping || cursorIndex < displayText.length) {
            scrollX = Math.max(0, Math.min(scrollX, maxScroll));
        }

        Render2D.save();
        Render2D.scissor(boxX + 5, boxY, visibleWidth, boxHeight);

        const textDrawX = boxX + 5 - scrollX;
        const textDrawY = boxY + boxHeight / 2;

        if (fieldIndex === 1) {
            option.textX1 = textDrawX;
            option.scrollX1 = scrollX;
        } else {
            option.textX2 = textDrawX;
            option.scrollX2 = scrollX;
        }

        drawText(displayText, textDrawX, textDrawY, FontSizes.REGULAR, textColor);

        if (isTyping) {
            const time = Date.now();
            if (time % 1000 < 500) {
                const cursorX = textDrawX + cursorPixelX;
                const cursorY = textDrawY - 4;
                const cursorHeight = 9;

                drawRect({
                    x: cursorX,
                    y: cursorY,
                    width: 1,
                    height: cursorHeight,
                    color: THEME.TEXT,
                });
            }
        }

        Render2D.restore();

        return { x: boxX, y: boxY, width: boxWidth, height: boxHeight };
    }

    draw(mouseX, mouseY) {
        this.updateAnimation();
        this.updateToggleAnimations();

        const panelWidth = this.optionPanelWidth - PADDING * 2;
        const textColor = THEME.TEXT;
        const cornerRadius = 10;

        this.drawHighlight(panelWidth, this.containerHeight);

        drawText(this.title, this.x, this.y + this.containerHeight / 2, FontSizes.REGULAR, textColor);

        const selected = this.options.filter((option) => option.enabled);
        const selectedText = selected.length === 1 ? selected[0].name : selected.length > 1 ? '...' : 'None';
        const arrowSize = 10;
        const rightMargin = 6;
        const selectWidth = Math.max(80, getTextWidth(selectedText, FontSizes.REGULAR) + 28);
        const selectX = this.x + panelWidth - selectWidth;
        const arrowX = selectX + selectWidth - arrowSize - rightMargin;
        const arrowY = this.y + (this.containerHeight - arrowSize) / 2;

        drawRoundedRectangleWithBorder({
            x: selectX,
            y: this.y + this.containerHeight / 2 - 9,
            width: selectWidth,
            height: 18,
            radius: 6,
            color: THEME.BG_COMPONENT,
            borderWidth: 1,
            borderColor: THEME.BORDER,
        });

        Render2D.save();
        Render2D.scissor(selectX + 10, this.y + this.containerHeight / 2 - 9, arrowX - selectX - 12, 18);
        drawText(selectedText, selectX + 10, this.y + this.containerHeight / 2, FontSizes.REGULAR, textColor);
        Render2D.restore();

        drawRoundedRectangle({
            x: arrowX,
            y: arrowY,
            width: arrowSize,
            height: arrowSize,
            radius: 4,
            color: THEME.BG_INSET,
        });

        const arrow = this.expanded ? '▼' : '▶';
        const arrowFontSize = FontSizes.SMALL;
        const centeredArrowY = arrowY + arrowSize / 2 + arrowFontSize / 2 - 3;

        drawText(arrow, arrowX + arrowSize / 2, centeredArrowY, arrowFontSize, textColor, 18);

        const componentRect = {
            x: this.x,
            y: this.y,
            width: panelWidth,
            height: this.containerHeight,
        };

        if (this.description && isInside(mouseX, mouseY, componentRect)) {
            setTooltip(this.description);
        }

        if (this.animationProgress > 0) {
            const fullDropdownHeight = this.getExpandedContentHeight();
            const animatedHeight = fullDropdownHeight * this.animationProgress;
            const dropdownX = this.x;
            const dropdownY = this.y + this.containerHeight + 4;

            drawRoundedRectangleWithBorder({
                x: dropdownX,
                y: dropdownY,
                width: panelWidth,
                height: animatedHeight,
                radius: cornerRadius,
                color: THEME.BG_ELEVATED,
                borderWidth: 1,
                borderColor: THEME.BORDER,
            });

            let currentY = dropdownY + this.dropdownPadding;
            for (let i = 0; i < this.options.length; i++) {
                const optionTop = currentY;
                if (optionTop >= dropdownY + animatedHeight) break;
                const option = this.options[i];
                const optionX = this.x + 10;

                const isOptionHovered = isInside(mouseX, mouseY, {
                    x: dropdownX,
                    y: optionTop,
                    width: panelWidth,
                    height: this.optionHeight,
                });

                if (isOptionHovered) {
                    drawRoundedRectangle({
                        x: dropdownX + 4,
                        y: optionTop,
                        width: panelWidth - 8,
                        height: this.optionHeight,
                        radius: 6,
                        color: THEME.BG_INSET,
                    });
                }

                const switchWidth = 26;
                const switchHeight = 16;
                const switchX = this.x + panelWidth - switchWidth - 10;
                const switchY = optionTop + (this.optionHeight - switchHeight) / 2;

                const hasInputs = option.placeholder1 || option.placeholder2 || option.val1 || option.val2;

                let inputRightEdge = switchX;
                if (hasInputs) {
                    const totalInputWidth = (option.placeholder2 || option.val2 ? this.inputBoxWidth : 0) +
                        (option.placeholder1 || option.val1 ? this.inputBoxWidth : 0) +
                        (option.placeholder1 || option.val1 ? this.inputBoxGap : 0);
                    inputRightEdge = switchX - totalInputWidth - 8;

                    const boxY = optionTop + (this.optionHeight - this.inputBoxHeight) / 2;

                    if (option.placeholder2 || option.val2) {
                        const box2X = inputRightEdge + this.inputBoxGap + (option.placeholder1 || option.val1 ? this.inputBoxWidth + this.inputBoxGap : 0);
                        option.inputRect2 = this.drawInputBox(
                            option,
                            box2X,
                            boxY,
                            this.inputBoxWidth,
                            this.inputBoxHeight,
                            option.val2,
                            option.placeholder2,
                            option.isTyping2,
                            option.cursorIndex2,
                            option.scrollX2,
                            option.textX2,
                            2,
                            i,
                            mouseX,
                            mouseY
                        );
                    }

                    if (option.placeholder1 || option.val1) {
                        const box1X = inputRightEdge + this.inputBoxGap;
                        option.inputRect1 = this.drawInputBox(
                            option,
                            box1X,
                            boxY,
                            this.inputBoxWidth,
                            this.inputBoxHeight,
                            option.val1,
                            option.placeholder1,
                            option.isTyping1,
                            option.cursorIndex1,
                            option.scrollX1,
                            option.textX1,
                            1,
                            i,
                            mouseX,
                            mouseY
                        );
                    }
                }

                const trackColor = interpolateColor(THEME.SWITCH_OFF, THEME.ACCENT, option.animationProgress);

                drawRoundedRectangle({
                    x: switchX,
                    y: switchY,
                    width: switchWidth,
                    height: switchHeight,
                    radius: switchHeight / 2,
                    color: trackColor,
                });

                const knobSize = 10;
                const knobPadding = 3;
                const knobX = switchX + knobPadding + (switchWidth - knobSize - knobPadding * 2) * option.animationProgress;
                const knobY = switchY + switchHeight / 2 - knobSize / 2;

                drawRoundedRectangle({
                    x: knobX,
                    y: knobY,
                    width: knobSize,
                    height: knobSize,
                    radius: knobSize / 2,
                    color: THEME.KNOB,
                });

                const nameX = optionX;
                const nameMaxWidth = hasInputs ? inputRightEdge - optionX - 8 : switchX - optionX - 8;
                const nameText = option.name;
                const nameWidth = getTextWidth(nameText, FontSizes.REGULAR);
                const displayName = nameWidth > nameMaxWidth ? nameText.substring(0, Math.max(0, Math.floor(nameMaxWidth / getTextWidth('a', FontSizes.REGULAR)) - 3)) + '...' : nameText;
                drawText(displayName, nameX, optionTop + this.optionHeight / 2, FontSizes.REGULAR, textColor);

                currentY += this.optionHeight;
                if (i < this.options.length - 1) {
                    currentY += this.optionSpacing;
                }
            }
        }
    }

    handleClick(mouseX, mouseY) {
        const panelWidth = this.optionPanelWidth - PADDING * 2;

        if (mouseX >= this.x && mouseX <= this.x + panelWidth && mouseY >= this.y && mouseY <= this.y + this.containerHeight) {
            this.expanded = !this.expanded;
            this.startAnimation(this.expanded);
            playClickSound();
            return true;
        }

        if (this.expanded) {
            const dropdownY = this.y + this.containerHeight + 4;
            const fullDropdownHeight = this.getExpandedContentHeight();

            if (mouseX >= this.x && mouseX <= this.x + panelWidth && mouseY >= dropdownY && mouseY <= dropdownY + fullDropdownHeight) {
                let currentY = dropdownY + this.dropdownPadding;
                for (let i = 0; i < this.options.length; i++) {
                    const optionTop = currentY;
                    const optionBottom = optionTop + this.optionHeight;
                    if (mouseY >= optionTop && mouseY <= optionBottom) {
                        const option = this.options[i];

                        if (option.inputRect1 && isInside(mouseX, mouseY, option.inputRect1)) {
                            this.focusedOptionIndex = i;
                            this.focusedField = 1;
                            option.isTyping1 = true;
                            option.isTyping2 = false;
                            option.cursorIndex1 = option.val1.length;
                            TypingState.isTyping = true;
                            setTextInputArea(option.inputRect1);
                            startTextInput(GuiState.myGui, option.inputRect1);
                            playClickSound();
                            return true;
                        }

                        if (option.inputRect2 && isInside(mouseX, mouseY, option.inputRect2)) {
                            this.focusedOptionIndex = i;
                            this.focusedField = 2;
                            option.isTyping2 = true;
                            option.isTyping1 = false;
                            option.cursorIndex2 = option.val2.length;
                            TypingState.isTyping = true;
                            setTextInputArea(option.inputRect2);
                            startTextInput(GuiState.myGui, option.inputRect2);
                            playClickSound();
                            return true;
                        }

                        const switchWidth = 26;
                        const switchX = this.x + panelWidth - switchWidth - 10;
                        const switchRect = {
                            x: switchX,
                            y: optionTop + (this.optionHeight - 16) / 2,
                            width: switchWidth,
                            height: 16,
                        };

                        if (isInside(mouseX, mouseY, switchRect)) {
                            if (this.singleSelect) {
                                const isEnabled = option.enabled;
                                if (isEnabled) {
                                    if (this.allowNone) {
                                        option.enabled = false;
                                        option.animationStart = Date.now();
                                    }
                                    playClickSound();
                                    if (this.callback) this.callback(this.options);
                                    return true;
                                }
                                this.options.forEach((opt, index) => {
                                    const newState = index === i;
                                    if (opt.enabled !== newState) {
                                        opt.enabled = newState;
                                        opt.animationStart = Date.now();
                                    }
                                });
                            } else {
                                option.enabled = !option.enabled;
                                option.animationStart = Date.now();
                            }
                            playClickSound();
                            if (this.callback) this.callback(this.options);
                            return true;
                        }

                        if (this.singleSelect) {
                            const isEnabled = option.enabled;
                            if (isEnabled) {
                                if (this.allowNone) {
                                    option.enabled = false;
                                    option.animationStart = Date.now();
                                }
                                playClickSound();
                                if (this.callback) this.callback(this.options);
                                return true;
                            }
                            this.options.forEach((opt, index) => {
                                const newState = index === i;
                                if (opt.enabled !== newState) {
                                    opt.enabled = newState;
                                    opt.animationStart = Date.now();
                                }
                            });
                        } else {
                            option.enabled = !option.enabled;
                            option.animationStart = Date.now();
                        }
                        playClickSound();
                        if (this.callback) this.callback(this.options);
                        return true;
                    }
                    currentY += this.optionHeight;
                    if (i < this.options.length - 1) {
                        currentY += this.optionSpacing;
                    }
                }
            }
        }

        if (this.focusedOptionIndex !== -1) {
            const option = this.options[this.focusedOptionIndex];
            if (this.focusedField === 1 && option.isTyping1) {
                option.isTyping1 = false;
                TypingState.isTyping = false;
                stopTextInput(GuiState.myGui);
                option.val1 = option.val1;
                if (this.callback) this.callback(this.options);
            } else if (this.focusedField === 2 && option.isTyping2) {
                option.isTyping2 = false;
                TypingState.isTyping = false;
                stopTextInput(GuiState.myGui);
                option.val2 = option.val2;
                if (this.callback) this.callback(this.options);
            }
            this.focusedOptionIndex = -1;
            this.focusedField = null;
            return true;
        }

        return false;
    }

    handleKeyType(char, keyCode) {
        if (this.focusedOptionIndex === -1 || this.focusedField === null) return false;

        const option = this.options[this.focusedOptionIndex];
        if (!option) return false;

        if (this.focusedField === 1 && option.isTyping1) {
            return this.handleInputKey(option, 1, char, keyCode);
        } else if (this.focusedField === 2 && option.isTyping2) {
            return this.handleInputKey(option, 2, char, keyCode);
        }
        return false;
    }

    handleInputKey(option, field, char, keyCode) {
        const valKey = field === 1 ? 'val1' : 'val2';
        const cursorKey = field === 1 ? 'cursorIndex1' : 'cursorIndex2';
        const isTypingKey = field === 1 ? 'isTyping1' : 'isTyping2';

        if (keyCode === ScriptKey.ENTER || keyCode === ScriptKey.ESCAPE) {
            option[isTypingKey] = false;
            TypingState.isTyping = false;
            stopTextInput(GuiState.myGui);
            this.focusedOptionIndex = -1;
            this.focusedField = null;
            if (this.callback) this.callback(this.options);
            return true;
        }

        const ctrlDown = Keyboard.isKeyDown(Keyboard.KEY_LCONTROL) || Keyboard.isKeyDown(Keyboard.KEY_RCONTROL);
        if (ctrlDown && keyCode === ScriptKey.V) {
            try {
                const clipboard = Toolkit.getDefaultToolkit().getSystemClipboard().getData(DataFlavor.stringFlavor);
                if (clipboard !== null && clipboard !== undefined) {
                    const pasted = String(clipboard).replace(/[\r\n]+/g, ' ');
                    if (pasted.length > 0) {
                        option[valKey] = option[valKey].slice(0, option[cursorKey]) + pasted + option[valKey].slice(option[cursorKey]);
                        option[cursorKey] += pasted.length;
                    }
                }
            } catch (e) {
                console.error(e);
            }
            return true;
        }

        if (keyCode === ScriptKey.LEFT) {
            if (option[cursorKey] > 0) {
                option[cursorKey] -= 1;
            }
            return true;
        }

        if (keyCode === ScriptKey.RIGHT) {
            if (option[cursorKey] < option[valKey].length) {
                option[cursorKey] += 1;
            }
            return true;
        }

        if (keyCode === ScriptKey.BACKSPACE) {
            if (option[cursorKey] > 0) {
                option[valKey] = option[valKey].slice(0, option[cursorKey] - 1) + option[valKey].slice(option[cursorKey]);
                option[cursorKey] -= 1;
            }
            return true;
        }

        const charString = String(char || '');
        if (charString && charString.codePointAt(0) >= ScriptKey.SPACE) {
            const charToAppend = getTypedCharacter(charString);
            option[valKey] = option[valKey].slice(0, option[cursorKey]) + charToAppend + option[valKey].slice(option[cursorKey]);
            option[cursorKey] += 1;
            return true;
        }

        return false;
    }
}