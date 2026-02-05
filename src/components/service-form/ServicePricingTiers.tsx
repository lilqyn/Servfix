import { UseFormReturn, useFieldArray } from "react-hook-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X, Star } from "lucide-react";
import type { ServiceFormData } from "@/pages/ServiceForm";

interface ServicePricingTiersProps {
  form: UseFormReturn<ServiceFormData>;
}

const ServicePricingTiers = ({ form }: ServicePricingTiersProps) => {
  const { fields } = useFieldArray({
    control: form.control,
    name: "pricingTiers",
  });

  const handleAddFeature = (tierIndex: number) => {
    const currentFeatures = form.getValues(`pricingTiers.${tierIndex}.features`) || [];
    form.setValue(`pricingTiers.${tierIndex}.features`, [...currentFeatures, ""]);
  };

  const handleRemoveFeature = (tierIndex: number, featureIndex: number) => {
    const currentFeatures = form.getValues(`pricingTiers.${tierIndex}.features`) || [];
    form.setValue(
      `pricingTiers.${tierIndex}.features`,
      currentFeatures.filter((_, i) => i !== featureIndex)
    );
  };

  const setPopularTier = (tierIndex: number) => {
    fields.forEach((_, index) => {
      form.setValue(`pricingTiers.${index}.popular`, index === tierIndex);
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-display font-bold text-foreground mb-2">
          Set Your Pricing Tiers
        </h2>
        <p className="text-muted-foreground">
          Create up to 3 pricing packages for different customer needs
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {fields.map((field, tierIndex) => {
          const isPopular = form.watch(`pricingTiers.${tierIndex}.popular`);
          const features = form.watch(`pricingTiers.${tierIndex}.features`) || [];

          return (
            <Card
              key={field.id}
              className={`border-border/50 relative ${
                isPopular ? "ring-2 ring-primary shadow-lg" : ""
              }`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-gradient-gold text-primary-foreground gap-1">
                    <Star className="h-3 w-3 fill-current" />
                    Most Popular
                  </Badge>
                </div>
              )}

              <CardHeader className="pt-6">
                <div className="flex items-center justify-between">
                  <FormField
                    control={form.control}
                    name={`pricingTiers.${tierIndex}.name`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input
                            {...field}
                            className="text-lg font-semibold border-0 p-0 h-auto focus-visible:ring-0"
                            placeholder="Tier Name"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  {!isPopular && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setPopularTier(tierIndex)}
                      className="text-xs"
                    >
                      Set Popular
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Price */}
                <FormField
                  control={form.control}
                  name={`pricingTiers.${tierIndex}.price`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price (GH₵)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                            GH₵
                          </span>
                          <Input
                            type="number"
                            placeholder="0"
                            className="pl-12 text-2xl font-bold"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Pricing Type */}
                <FormField
                  control={form.control}
                  name={`pricingTiers.${tierIndex}.pricingType`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pricing Type</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value ?? "flat"}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select pricing type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="flat">Flat price</SelectItem>
                            <SelectItem value="per_unit">Per guest/item</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {form.watch(`pricingTiers.${tierIndex}.pricingType`) === "per_unit" && (
                  <FormField
                    control={form.control}
                    name={`pricingTiers.${tierIndex}.unitLabel`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit Label</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., plate, guest, item" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Description */}
                <FormField
                  control={form.control}
                  name={`pricingTiers.${tierIndex}.description`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Short Description</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Perfect for small events" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Delivery Time */}
                <FormField
                  control={form.control}
                  name={`pricingTiers.${tierIndex}.deliveryTime`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Delivery/Service Time</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., 2-3 days notice" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Features */}
                <div className="space-y-3">
                  <FormLabel>What's Included</FormLabel>
                  {features.map((_, featureIndex) => (
                    <div key={featureIndex} className="flex gap-2">
                      <FormField
                        control={form.control}
                        name={`pricingTiers.${tierIndex}.features.${featureIndex}`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input placeholder="Feature description" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      {features.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveFeature(tierIndex, featureIndex)}
                          className="shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => handleAddFeature(tierIndex)}
                  >
                    <Plus className="h-4 w-4" />
                    Add Feature
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-border/50 bg-muted/30">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Star className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-1">Pricing Tips</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Set your Basic tier for small events (10-30 guests)</li>
                <li>• Standard should cover most typical events (30-100 guests)</li>
                <li>• Premium is for large or premium events with extra services</li>
                <li>• Mark your most-booked package as "Popular" to guide customers</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ServicePricingTiers;
