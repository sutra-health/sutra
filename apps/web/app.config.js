export default ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    demoMode: process.env.EXPO_PUBLIC_DEMO_MODE === "true"
  }
});
