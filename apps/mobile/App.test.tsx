import { render, screen } from '@testing-library/react-native';
import App from './App';

jest.mock('./src/db/migrate', () => ({
  useDatabaseMigrations: () => ({ success: true, error: undefined }),
}));

describe('App', () => {
  it('renders the hello world screen', async () => {
    await render(<App />);
    expect(screen.getByText('Hello!')).toBeOnTheScreen();
  });
});
