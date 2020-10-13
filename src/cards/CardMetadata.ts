import { CardRequirements } from "./CardRequirements";

export interface CardMetadata {
    cardNumber: number;
    description?: string;
    requirements?: CardRequirements;
    points?: number; //#TODO -> class to handle points per tag and other special cases
}
