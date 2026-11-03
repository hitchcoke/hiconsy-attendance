module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'Hiconsy Attendance',
    appBundleId: 'com.hiconsy.attendance.assignment',
    ignore: [/^\/(src|docs|scripts|data|artifacts|\.idea|\.git|out)(\/|$)/, /^\/dist\/(server|shared)(\/|$)/, /^\/node_modules(\/|$)/, /^\/\.env/, /^\/package-lock\.json$/],
  },
  makers: [{ name: '@electron-forge/maker-zip', platforms: ['darwin', 'win32', 'linux'] }],
};
