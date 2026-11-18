import { render, screen } from '@testing-library/react-native';
import App from './App';

describe('App', () => {
  it('renders the hello world screen', () => {
    render(<App />);
    expect(screen.getByText('Hello!')).toBeOnTheScreen();
  });
});
