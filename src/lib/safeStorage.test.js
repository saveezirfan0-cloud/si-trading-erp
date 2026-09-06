// A phone whose browser blocks site data throws on the `localStorage`
// *property access* itself. One unguarded access during AppProvider's initial
// state took the whole app down, so si.skofi.tech/login showed the crash
// screen instead of the sign-in form. These pin that shut.
const DENIED = new Error(
  "Failed to read the 'localStorage' property from 'Window': " +
  'Access is denied for this document.'
);

const realDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');

// Make the property itself hostile, the way a locked-down browser does.
const denyStorage = () => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() { throw DENIED; },
  });
};

const restoreStorage = () => {
  if (realDescriptor) Object.defineProperty(window, 'localStorage', realDescriptor);
};

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addEventListener() {}, removeEventListener() {},
  }));
});

afterEach(() => {
  restoreStorage();
  jest.resetModules();
});

test('reads and writes survive a browser that denies localStorage', () => {
  denyStorage();
  jest.isolateModules(() => {
    const { default: safeStorage, storageIsPersistent } = require('./safeStorage');

    expect(storageIsPersistent).toBe(false);
    expect(safeStorage.getItem('missing')).toBeNull();

    // Values are still readable back within the tab.
    expect(() => safeStorage.setItem('si-fy-start', '7')).not.toThrow();
    expect(safeStorage.getItem('si-fy-start')).toBe('7');

    expect(() => safeStorage.removeItem('si-fy-start')).not.toThrow();
    expect(safeStorage.getItem('si-fy-start')).toBeNull();
  });
});

test('the real localStorage is used when the browser allows it', () => {
  jest.isolateModules(() => {
    const { default: safeStorage, storageIsPersistent } = require('./safeStorage');

    expect(storageIsPersistent).toBe(true);
    safeStorage.setItem('si-probe', 'kept');
    expect(window.localStorage.getItem('si-probe')).toBe('kept');
    safeStorage.removeItem('si-probe');
  });
});

test('AppProvider still renders its children when site data is blocked', () => {
  denyStorage();
  jest.isolateModules(() => {
    // React has to come from the same isolated registry as the provider, or
    // the two copies disagree about whose hooks are running.
    const React = require('react');
    const { act } = React;
    const { createRoot } = require('react-dom/client');
    const { AppProvider } = require('../contexts/AppContext');

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    // Before the fix this threw, unmounting the tree up to the ErrorBoundary.
    act(() => {
      root.render(React.createElement(AppProvider, null,
        React.createElement('span', null, 'signed out')));
    });
    expect(host.textContent).toContain('signed out');

    act(() => { root.unmount(); });
    host.remove();
  });
});
