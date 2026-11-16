// Error factories (functional style). Each returns a plain Error with a name,
// so call sites can throw without using `class`.

export const notFoundError = (msg: string): Error => {
  const e = new Error(msg);
  e.name = 'NotFoundError';
  return e;
};

export const commitConflictError = (msg: string): Error => {
  const e = new Error(msg);
  e.name = 'CommitConflictError';
  return e;
};

export const stateError = (msg: string): Error => {
  const e = new Error(msg);
  e.name = 'StateError';
  return e;
};
