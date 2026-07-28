import { render, screen, fireEvent } from '@testing-library/react';
import PropertyFilters from './PropertyFilters';

describe('PropertyFilters', () => {
  test('renders all filter inputs', () => {
    render(<PropertyFilters onSearch={jest.fn()} />);

    expect(screen.getByLabelText(/city/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/zip code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/min price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/max price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/beds/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/baths/i)).toBeInTheDocument();
  });

  test('calls onSearch with filter values when submitted', () => {
    const onSearch = jest.fn();
    render(<PropertyFilters onSearch={onSearch} />);

    fireEvent.change(screen.getByLabelText(/city/i), {
      target: { value: 'Portland' }
    });
    fireEvent.change(screen.getByLabelText(/min price/i), {
      target: { value: '300000' }
    });

    fireEvent.click(screen.getByText('Search'));

    expect(onSearch).toHaveBeenCalledWith({
      city: 'Portland',
      minPrice: '300000'
    });
  });

  test('clears all filters when Clear button clicked', () => {
    const onSearch = jest.fn();
    render(<PropertyFilters onSearch={onSearch} />);

    fireEvent.change(screen.getByLabelText(/city/i), {
      target: { value: 'Portland' }
    });
    fireEvent.click(screen.getByText(/clear filters/i));

    expect(screen.getByLabelText(/city/i)).toHaveValue('');
    expect(onSearch).toHaveBeenCalledWith({});
  });

  test('removes empty filter values before submitting', () => {
    const onSearch = jest.fn();
    render(<PropertyFilters onSearch={onSearch} />);

    fireEvent.change(screen.getByLabelText(/city/i), {
      target: { value: 'Portland' }
    });
    
    fireEvent.click(screen.getByText('Search'));

    expect(onSearch).toHaveBeenCalledWith({
      city: 'Portland'
    });
    
  });
});