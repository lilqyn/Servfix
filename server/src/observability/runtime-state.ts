let shuttingDown = false;

export const setShuttingDown = (value: boolean) => {
  shuttingDown = value;
};

export const isShuttingDown = () => shuttingDown;
