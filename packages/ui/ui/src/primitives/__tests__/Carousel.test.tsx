import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Carousel, CarouselContent, CarouselItem } from '../Carousel';

describe('Carousel', () => {
  it('renders slides without crashing', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
          <CarouselItem>Slide 2</CarouselItem>
        </CarouselContent>
      </Carousel>,
    );
    expect(screen.getByRole('region')).toBeTruthy();
    expect(screen.getByText('Slide 1')).toBeTruthy();
  });
});
