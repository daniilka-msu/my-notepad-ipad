const Autosave = (() => {
  function create({
    write,
    active,
    ready = () => true,
    state = () => {},
    clock = globalThis,
  }) {
    let revision = 0,
      saved = 0,
      pending = null,
      timer,
      checkpoint,
      requested = false;
    const emit = (value) => state(value, revision !== saved);
    function schedule(delay = 3000) {
      clock.clearTimeout(timer);
      if (revision !== saved)
        timer = clock.setTimeout(() => flush().catch(() => {}), delay);
    }
    function dirty() {
      revision++;
      emit(pending ? "saving" : "dirty");
      schedule();
      if (!checkpoint)
        checkpoint = clock.setTimeout(() => {
          checkpoint = null;
          requested = true;
          flush().catch(() => {});
        }, 600000);
    }
    function input() {
      dirty();
      clock.clearTimeout(timer);
    }
    function idle() {
      if (requested) flush().catch(() => {});
      else schedule();
    }
    function flush(force = false, immediate = false) {
      if (force && revision === saved) dirty();
      if (pending) {
        requested = true;
        return force ? pending.then(() => flush(false, immediate)) : pending;
      }
      if (revision === saved) return Promise.resolve();
      if (!ready() || active()) {
        requested = true;
        return Promise.resolve();
      }
      clock.clearTimeout(timer);
      const version = revision;
      requested = false;
      emit("saving");
      // Give queued pointer events priority before preparing the IndexedDB value.
      pending = (
        immediate
          ? Promise.resolve()
          : new Promise((resolve) => clock.setTimeout(resolve, 0))
      )
        .then(() => {
          if (active()) {
            requested = true;
            return false;
          }
          return Promise.resolve(write()).then((result) => result !== false);
        })
        .then(
          (written) => {
            if (written) saved = version;
            else requested = true;
            emit(revision === saved ? "saved" : "dirty");
            if (revision === saved) {
              requested = false;
              clock.clearTimeout(checkpoint);
              checkpoint = null;
            }
          },
          (error) => {
            emit("error");
            throw error;
          },
        )
        .finally(() => {
          pending = null;
          if (revision !== saved) {
            if (requested && !active()) schedule(0);
            else if (!active()) schedule();
          }
        });
      return pending;
    }
    return {
      dirty,
      input,
      idle,
      flush,
      get dirtyState() {
        return revision !== saved;
      },
    };
  }
  return { create };
})();
