import { render, screen, fireEvent } from '@testing-library/react';
import Pagination from './Pagination';

describe('Pagination', () => {
    test('renders pagination controls', () => {
        const onPageChange = jest.fn();
        render(<Pagination currentPage={1} totalPages={5} onPageChange={onPageChange} />);

        expect(screen.getByText('Previous')).toBeInTheDocument();
        expect(screen.getByText('Next')).toBeInTheDocument();
        expect(screen.getByText('1')).toBeInTheDocument();
        expect(screen.getByText('5')).toBeInTheDocument();
    });

    test('disables Previous button on first page', () => {
        const onPageChange = jest.fn();
        render(<Pagination currentPage={1} totalPages={5} onPageChange={onPageChange} />);

        const prevButton = screen.getByText('Previous');
        expect(prevButton).toBeDisabled();
    });

    test('disables Next button on last page', () => {
        const onPageChange = jest.fn();
        render(<Pagination currentPage={5} totalPages={5} onPageChange={onPageChange} />);

        const nextButton = screen.getByText('Next');
        expect(nextButton).toBeDisabled();
    });

    test('calls onPageChange when Next is clicked', () => {
        const onPageChange = jest.fn();
        render(<Pagination currentPage={2} totalPages={5} onPageChange={onPageChange} />);

        const nextButton = screen.getByText('Next');
        fireEvent.click(nextButton);
        expect(onPageChange).toHaveBeenCalledWith(3);
    });

    test('calls onPageChange when Previous is clicked', () => {
        const onPageChange = jest.fn();
        render(<Pagination currentPage={3} totalPages={5} onPageChange={onPageChange} />);

        const prevButton = screen.getByText('Previous');
        fireEvent.click(prevButton);
        expect(onPageChange).toHaveBeenCalledWith(2);
    });

    test('calls onPageChange when page number is clicked', () => {
        const onPageChange = jest.fn();
        render(<Pagination currentPage={1} totalPages={5} onPageChange={onPageChange} />);

        const page3Button = screen.getByText('3');
        fireEvent.click(page3Button);
        expect(onPageChange).toHaveBeenCalledWith(3);
    });

    test('highlights current page', () => {
        const onPageChange = jest.fn();
        render(<Pagination currentPage={3} totalPages={5} onPageChange={onPageChange} />);

        const page3Button = screen.getByText('3');
        expect(page3Button).toHaveClass('active');
    });

    test('does not render when totalPages is 1', () => {
        const onPageChange = jest.fn();
        const { container } = render(
            <Pagination currentPage={1} totalPages={1} onPageChange={onPageChange} />
        );

        expect(container).toBeEmptyDOMElement();
    });

    test('shows ellipsis and end page when current page is near the start', () => {
        render(<Pagination currentPage={2} totalPages={20} onPageChange={jest.fn()} />);

        expect(screen.getByText('1')).toBeInTheDocument();
        expect(screen.getByText('5')).toBeInTheDocument();
        expect(screen.getByText('20')).toBeInTheDocument();
        expect(screen.getByText('...')).toBeInTheDocument();
        expect(screen.queryByText('6')).not.toBeInTheDocument();
    });

    test('shows ellipsis and start page when current page is near the end', () => {
        render(<Pagination currentPage={18} totalPages={20} onPageChange={jest.fn()} />);

        expect(screen.getByText('1')).toBeInTheDocument();
        expect(screen.getByText('16')).toBeInTheDocument();
        expect(screen.getByText('20')).toBeInTheDocument();
        expect(screen.getByText('...')).toBeInTheDocument();
        expect(screen.queryByText('15')).not.toBeInTheDocument();
    });

    test('shows two ellipses when current page is in the middle', () => {
        render(<Pagination currentPage={10} totalPages={20} onPageChange={jest.fn()} />);

        expect(screen.getByText('1')).toBeInTheDocument();
        expect(screen.getByText('9')).toBeInTheDocument();
        expect(screen.getByText('10')).toBeInTheDocument();
        expect(screen.getByText('11')).toBeInTheDocument();
        expect(screen.getByText('20')).toBeInTheDocument();
        expect(screen.getAllByText('...')).toHaveLength(2);
    });
});