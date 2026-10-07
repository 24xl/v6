// Swallows background-thread connection failures (e.g. Noam/anti-RAT data downloads) so they
// don't spam the console with stack traces. Everything else still prints as before.
const Thread = Java.type('java.lang.Thread');

try {
    Thread.setDefaultUncaughtExceptionHandler(
        Java.extend(Java.type('java.lang.Thread$UncaughtExceptionHandler'), {
            uncaughtException(thread, err) {
                const name = String(err?.getClass?.()?.getName?.() ?? '');
                const text = String(err ?? '');
                if (name.includes('Connect') || /connect\s*timeout|connection\s*timed\s*out/i.test(text)) return;
                err?.printStackTrace?.();
            },
        })
    );
} catch (error) {
    // best-effort: if the handler can't be installed, nothing changes
}