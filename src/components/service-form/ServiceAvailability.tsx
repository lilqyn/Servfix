import { UseFormReturn } from "react-hook-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, Clock, CalendarDays, Users } from "lucide-react";
import type { ServiceFormData } from "@/pages/ServiceForm";

const daysOfWeek = [
  { id: "monday", label: "Mon" },
  { id: "tuesday", label: "Tue" },
  { id: "wednesday", label: "Wed" },
  { id: "thursday", label: "Thu" },
  { id: "friday", label: "Fri" },
  { id: "saturday", label: "Sat" },
  { id: "sunday", label: "Sun" },
];

interface ServiceAvailabilityProps {
  form: UseFormReturn<ServiceFormData>;
}

const ServiceAvailability = ({ form }: ServiceAvailabilityProps) => {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Working Days */}
      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Working Days</CardTitle>
              <CardDescription>Select the days you're available</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <FormField
            control={form.control}
            name="availability.days"
            render={() => (
              <FormItem>
                <div className="grid grid-cols-7 gap-2">
                  {daysOfWeek.map((day) => (
                    <FormField
                      key={day.id}
                      control={form.control}
                      name="availability.days"
                      render={({ field }) => {
                        const isChecked = field.value?.includes(day.id);
                        return (
                          <FormItem>
                            <FormControl>
                              <button
                                type="button"
                                onClick={() => {
                                  const currentValue = field.value || [];
                                  if (isChecked) {
                                    field.onChange(currentValue.filter((d) => d !== day.id));
                                  } else {
                                    field.onChange([...currentValue, day.id]);
                                  }
                                }}
                                className={`w-full py-3 px-2 rounded-lg text-sm font-medium transition-colors ${
                                  isChecked
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                                }`}
                              >
                                {day.label}
                              </button>
                            </FormControl>
                          </FormItem>
                        );
                      }}
                    />
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={() => {
                form.setValue("availability.days", ["monday", "tuesday", "wednesday", "thursday", "friday"]);
              }}
              className="text-sm text-primary hover:underline"
            >
              Weekdays only
            </button>
            <span className="text-muted-foreground">•</span>
            <button
              type="button"
              onClick={() => {
                form.setValue("availability.days", ["saturday", "sunday"]);
              }}
              className="text-sm text-primary hover:underline"
            >
              Weekends only
            </button>
            <span className="text-muted-foreground">•</span>
            <button
              type="button"
              onClick={() => {
                form.setValue("availability.days", daysOfWeek.map(d => d.id));
              }}
              className="text-sm text-primary hover:underline"
            >
              All days
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Working Hours */}
      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-secondary/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-secondary" />
            </div>
            <div>
              <CardTitle>Working Hours</CardTitle>
              <CardDescription>Set your available time slots</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="availability.startTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Time</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="availability.endTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>End Time</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <p className="text-sm text-muted-foreground">
            Customers can only book services within these hours
          </p>
        </CardContent>
      </Card>

      {/* Booking Settings */}
      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-accent/50 flex items-center justify-center">
              <CalendarDays className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <CardTitle>Booking Settings</CardTitle>
              <CardDescription>Control how customers can book</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            control={form.control}
            name="availability.advanceBooking"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Minimum Notice (Days)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    placeholder="3"
                    {...field}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
                <FormDescription>
                  How many days in advance must customers book?
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="availability.maxBookingsPerDay"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max Bookings Per Day</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    placeholder="2"
                    {...field}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
                <FormDescription>
                  Limit daily bookings to ensure quality service
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>

      {/* Capacity Info */}
      <Card className="border-border/50 bg-muted/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Availability Tips</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li>• <strong>Weekends</strong> are typically busiest for event services</li>
            <li>• Set realistic <strong>minimum notice</strong> to prepare properly</li>
            <li>• Consider <strong>travel time</strong> between bookings</li>
            <li>• Update your availability during <strong>peak seasons</strong></li>
            <li>• You can pause bookings anytime from your dashboard</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default ServiceAvailability;
