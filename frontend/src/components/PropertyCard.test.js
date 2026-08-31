import { render, screen, fireEvent } from '@testing-library/react';
import PropertyCard from './PropertyCard';
import { formatPrice, formatCity } from '../utils/formatting';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
    useNavigate: () => mockNavigate,
}));

const mockProperty = {
    L_ListingID: '12345',
    L_Address: '123 Main St',
    L_City: 'portland',
    L_State: 'OR',
    L_SystemPrice: 450000,
    L_Keyword2: 3,
    LM_Dec_3: '2',
    LM_Int2_3: 1800,
    L_Photos: null,
};

describe('PropertyCard', () => {
    beforeEach(() => {
        mockNavigate.mockClear();
    });

    test('renders property data', () => {
        render(<PropertyCard property={mockProperty} />);

        expect(screen.getByText(mockProperty.L_Address)).toBeInTheDocument();
        expect(screen.getByText(formatPrice(mockProperty.L_SystemPrice))).toBeInTheDocument();
        expect(screen.getByText(`${formatCity(mockProperty.L_City)}, OR`)).toBeInTheDocument();
        expect(screen.getByText('3 beds')).toBeInTheDocument();
        expect(screen.getByText('2 baths')).toBeInTheDocument();
        expect(screen.getByText('1,800 sqft')).toBeInTheDocument();
    });

    test('navigates to detail page when clicked', () => {
        render(<PropertyCard property={mockProperty} />);

        fireEvent.click(screen.getByRole('button'));
        expect(mockNavigate).toHaveBeenCalledWith('/property/12345');
    });

    test('navigates when Enter key is pressed', () => {
        render(<PropertyCard property={mockProperty} />);

        fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
        expect(mockNavigate).toHaveBeenCalledWith('/property/12345');
    });

    test('navigates when Space key is pressed', () => {
        render(<PropertyCard property={mockProperty} />);

        fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
        expect(mockNavigate).toHaveBeenCalledWith('/property/12345');
    });

    test('does not navigate on unrelated key press', () => {
        render(<PropertyCard property={mockProperty} />);

        fireEvent.keyDown(screen.getByRole('button'), { key: 'Tab' });
        expect(mockNavigate).not.toHaveBeenCalled();
    });
});