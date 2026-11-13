import { ModuleBase } from '../../utils/ModuleBase';
import { Slider } from '../../gui/components/Slider';
import { ToggleButton } from '../../gui/components/Toggle';
import { ColorPicker } from '../../gui/components/ColorPicker';
import { Separator } from '../../gui/components/Separator';
import { Color } from '../../utils/Constants';
import { chat } from '../../utils/Chat';
import { lividSettings, puzzleSettings } from '../../utils/catacombs/puzzles/PuzzleSettings';
import { describeStatus } from '../../utils/catacombs/puzzles/PuzzleRuntime';

class Legit extends ModuleBase {
    constructor() {
        super({
            name: 'Legit',
            subcategory: 'Catacombs',
            description: 'Catacombs legit features.',
            tooltip: 'Catacombs legit features.',
            showEnabledToggle: false,
        });

        this.setupPuzzleSolvers();
        this.setupLividSolver();

        register('command', () => {
            for (const line of describeStatus()) chat('&7' + line);
        }).setName('legit');
    }

    setupPuzzleSolvers() {
        const s = puzzleSettings;
        const popup = this.addPopup('Puzzle Solvers', null, 'Solvers for the Catacombs puzzle rooms. Each one only runs inside its own room.');

        const section = (title) => popup.addComponent(new Separator(title, true), '');

        const toggle = (title, key, description, onChange) =>
        popup.addComponent(
            new ToggleButton(
                title,
                0,
                0,
                undefined,
                undefined,
                (v) => {
                    s[key] = !!v;
                    if (onChange) onChange(!!v);
                },
                s[key]
            ),
            description
        );

        const slider = (title, min, max, key, description) =>
        popup.addComponent(new Slider(title, min, max, 0, 0, undefined, undefined, s[key], (v) => (s[key] = Math.round(v))), description);

        // Keep all Java Color integer channels inside the valid 0-255 range.
        const channel = (value) => {
            const n = Number(value);
            return Number.isFinite(n) ? Math.max(0, Math.min(255, Math.round(n))) : 255;
        };

        const color = (title, key, description) => {
            const c = s[key] || { r: 255, g: 255, b: 255, a: 255 };

            const component = new ColorPicker(
                title,
                0,
                0,
                new Color(channel(c.r), channel(c.g), channel(c.b), channel(c.a)),
                                              (picked) => {
                                                  s[key] = {
                                                      r: picked.getRed(),
                                              g: picked.getGreen(),
                                              b: picked.getBlue(),
                                              a: picked.getAlpha()
                                                  };
                                              }
            );

            popup.addComponent(component, description);
            return component;
        };

        section('Blaze');
        toggle('Blaze Solver', 'blaze', 'Highlights the blazes in the order you should kill them.');
        toggle('Blaze Done Message', 'blazeDoneMessage', 'Sends "Blaze Done!" in party chat when the puzzle is finished.');
        slider('Blaze Count', 1, 10, 'blazeCount', 'How many blazes to highlight at once.');
        color('Blaze 1 Color', 'firstBlazeColor', 'Colour of the blaze to kill first.');
        color('Blaze 2 Color', 'secondBlazeColor', 'Colour of the blaze to kill second.');
        color('Blaze 3 Color', 'thirdBlazeColor', 'Colour of the blaze to kill third and after.');
        color('Blaze Line Color', 'lineColor', 'Colour of the line connecting the blazes.');

        section('Boulder');
        toggle('Boulder Solver', 'boulder', 'Shows which boulders to push and which blocks to click.');
        toggle('Show All Boulders', 'showAll', 'Show every move at once, not just the next one.');
        color('Boulder Box Color', 'boxColor', 'Colour of the boulder to push.');
        color('Boulder Click Color', 'clickColor', 'Colour of the block to click.');

        section('Creeper Beams');
        toggle('Creeper Beams Solver', 'creeper', 'Shows the lantern pairs to connect.');
        toggle('Creeper Render Lines', 'renderLines', 'Draw a line between each pair.');
        toggle('Creeper Phase', 'phase', 'Show the lanterns through walls.');

        section('Quiz');
        toggle('Quiz Solver', 'quiz', 'Highlights the correct answer.');
        color('Quiz Answer Color', 'answerColor', 'Colour of the correct answer block.');
        toggle('Block Wrong Quiz Clicks', 'quizBlockWrongClicks', 'Stops you clicking a wrong answer (sneak to override).');

        section('Teleport Maze');
        toggle('Teleport Maze Solver', 'tpmaze', 'Works out the correct teleport pad from where each pad sends you.');
        color('Correct Pad Color', 'correctTpPadColor', 'Colour of the pad to take.');
        color('Wrong Pad Color', 'wrongTpPadColor', 'Colour of pads that are known to be wrong.');

        section('Three Weirdos');
        toggle('Three Weirdos Solver', 'weirdos', 'Finds the chest with the reward.');
        toggle('Remove Wrong Chests', 'removeChests', 'Hide the wrong chests instead of colouring them.');
        color('Correct Chest Color', 'colorCorrect', 'Colour of the correct chest.');
        color('Wrong Chest Color', 'colorWrong', 'Colour of the wrong chests.');

        section('Tic Tac Toe');
        toggle('Tic Tac Toe Solver', 'ttt', 'Highlights the best move.');
        toggle('Prevent Miss Click', 'preventMissClick', 'Stops you clicking a button that is not a best move.');
        color('Tic Tac Toe Color', 'tttColor', 'Colour of the best moves.');
        let predictionColor;
        toggle('Prediction', 'prediction', 'Also predict the AI reply and the next move.', (v) => (predictionColor.visible = v));
        predictionColor = color('Prediction Color', 'predictionColor', 'Colour of the move to prefire.');
        predictionColor.visible = s.prediction;

        section('Water Board');
        toggle('Water Board Solver', 'water', 'Shows which lever to pull and when.');
        color('Water Click Color', 'currentClickColor', 'Colour of the line to the next lever.');
        color('Water Next Click Color', 'nextColor', 'Colour of the line between the next two levers.');

        section('Ice Fill');
        toggle('Ice Fill Solver', 'icefill', 'Draws the path through the ice.');
        color('Ice Fill Color', 'icefillColor', 'Colour of the path.');

        section('Ice Path');
        toggle('Ice Path Solver', 'icepath', 'Draws the silverfish path.');
        color('Ice Path First Color', 'icePathFirstColor', 'Colour of the next segment.');
        color('Ice Path Color', 'icePathColor', 'Colour of the remaining segments.');
    }

    setupLividSolver() {
        const s = lividSettings;
        const popup = this.addPopup('Livid Solver', null, 'Finds the real Livid on F5.');

        let tracerColor;
        let iceSprayTitle;

        const toggle = (title, key, description, onChange) => {
            const component = new ToggleButton(
                title,
                0,
                0,
                undefined,
                undefined,
                (v) => {
                    s[key] = !!v;
                    if (onChange) onChange(!!v);
                },
                s[key]
            );

            popup.addComponent(component, description);
            return component;
        };

        // Use the same safe 0-255 conversion for Livid colors.
        const channel = (value) => {
            const n = Number(value);
            return Number.isFinite(n) ? Math.max(0, Math.min(255, Math.round(n))) : 255;
        };

        const color = (title, key, description) => {
            const c = s[key] || { r: 255, g: 255, b: 255, a: 255 };

            const component = new ColorPicker(
                title,
                0,
                0,
                new Color(channel(c.r), channel(c.g), channel(c.b), channel(c.a)),
                                              (picked) => {
                                                  s[key] = {
                                                      r: picked.getRed(),
                                              g: picked.getGreen(),
                                              b: picked.getBlue(),
                                              a: picked.getAlpha()
                                                  };
                                              }
            );

            popup.addComponent(component, description);
            return component;
        };

        toggle('Livid Solver', 'enabled', 'Highlight the real Livid.');
        toggle('Show Livid HP', 'showHp', 'Show the Livid health above it.');
        toggle('Livid Tracer', 'tracer', 'Draw a line to the Livid.', (v) => (tracerColor.visible = v));
        toggle('Livid Invulnerability Timer', 'invulnerabilityTimer', 'Alert when Livid can be damaged again.', (v) => (iceSprayTitle.visible = v));
        iceSprayTitle = toggle('Ice Spray Title', 'iceSprayTitle', 'Show a title when the ice spray window starts.');

        color('Livid Highlight Color', 'highlightColor', 'Colour of the Livid highlight.');
        tracerColor = color('Livid Tracer Color', 'tracerColor', 'Colour of the tracer.');

        iceSprayTitle.visible = s.invulnerabilityTimer;
        tracerColor.visible = s.tracer;
    }
}

new Legit();
