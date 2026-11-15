import App from '../../App';
import { StartupScreen } from '../startup/StartupScreen';

export function AppRouter() {
  return (
    <StartupScreen>
      <App />
    </StartupScreen>
  );
}
